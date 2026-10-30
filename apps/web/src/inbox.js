export function initInbox({api,token,state,toast}){
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>v?new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(v)):'';
 let conversations=[],currentId=null,currentConversation=null,messages=[],channel=null,userChannel=null,realtime=null;
 let callRoom=null,callId=null,callType=null,callIsCaller=false,callMic=true,callCamera=true,screenShare=false;
 let typingTimer=null,typingStop=null,incomingPoll=null,conversationPoll=null,recorder=null,recordStream=null,recordChunks=[],selectedMembers=new Map();
 let messagingSettings={online_status_visible:true,read_receipts_enabled:true,allow_voice_messages:true,allow_media_messages:true,typing_indicators_enabled:true,call_notifications_enabled:true};
 const root=$('view-inbox');
 if(!root)return;
 const callOverlay=$('zv-call-overlay');
 const callGrid=$('zv-call-grid');
 const callLabel=$('zv-call-label');
 const incomingCard=$('zv-incoming-call');
 if(incomingCard&&callOverlay){document.body.append(incomingCard,callOverlay);}
 const selectedGroup=$('zv-selected-members');
 const profileId=()=>state.me?.profile?.id||state.me?.user?.id||null;

 async function loadMessagingSettings(){try{messagingSettings=await api('/api/v1/me/settings');}catch(error){console.warn('Messaging preferences unavailable; server defaults remain active.',error);}}
 async function ensureRealtime(){
  if(!token()||!state.config?.supabaseUrl||!state.config?.supabaseAnonKey||!window.supabase?.createClient)return false;
  try{
   if(!messagingSettings||!Object.keys(messagingSettings).length)await loadMessagingSettings();
   if(!realtime)realtime=window.supabase.createClient(state.config.supabaseUrl,state.config.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:10}}});
   await realtime.realtime.setAuth(token());
   const uid=profileId();
   if(uid&&!userChannel){
    userChannel=realtime.channel('user:'+uid,{config:{private:true,presence:{key:uid}}})
     .on('broadcast',{event:'call.invite'},()=>refreshIncomingCalls())
     .on('broadcast',{event:'call.state'},()=>refreshIncomingCalls())
     .on('presence',{event:'sync'},()=>renderOnlinePresence())
     .subscribe(async status=>{if(status==='SUBSCRIBED'&&messagingSettings.online_status_visible!==false){try{await userChannel.track({userId:uid,onlineAt:new Date().toISOString()});}catch{}}});
   }
   return true;
  }catch(error){console.warn('Inbox realtime unavailable; polling fallback remains active.',error);return false;}
 }
 function renderOnlinePresence(){
  const online=new Set();
  if(!userChannel)return;
  const presence=userChannel.presenceState?.()||{};
  for(const rows of Object.values(presence))for(const row of rows||[])if(row.userId)online.add(row.userId);
  root.querySelectorAll('[data-peer-id]').forEach(node=>node.classList.toggle('online',online.has(node.dataset.peerId)));
 }
 async function signedMediaUrl(id){try{const r=await api('/api/v1/media/view-url?id='+encodeURIComponent(id));return r.url||null;}catch{return null;}}
 function show(){
  if(!token()){toast('Sign in to open your inbox.');return;}
  loadConversations();
  loadMessagingSettings().then(()=>ensureRealtime()).then(()=>refreshIncomingCalls());
  if(!incomingPoll)incomingPoll=setInterval(refreshIncomingCalls,8000);
  if(!conversationPoll)conversationPoll=setInterval(()=>{if(currentId&&!channel)loadMessages(currentId);},12000);
 }
 async function signedIn(){if(!token())return;await loadMessagingSettings();await ensureRealtime();await loadConversations();await refreshIncomingCalls();}
 async function logout(){
  if(incomingPoll)clearInterval(incomingPoll);if(conversationPoll)clearInterval(conversationPoll);
  incomingPoll=conversationPoll=null;await leaveConversationChannel();if(userChannel){await realtime.removeChannel(userChannel).catch(()=>{});userChannel=null;}
  if(realtime){realtime.removeAllChannels();realtime=null;}
  conversations=[];currentId=null;currentConversation=null;messages=[];stopRecording();
  if(callRoom)await endCall(true);
  renderConversationList();renderThreadEmpty();
 }
 function renderConversationList(){
  const host=$('zv-conversation-list');if(!host)return;
  const query=String($('zv-inbox-search')?.value||'').trim().toLowerCase();
  const rows=conversations.filter(c=>{
   const name=c.title||c.peer?.display_name||c.peer?.handle||'Conversation';
   return !query||(name+' '+(c.peer?.handle||'')+' '+(c.lastMessage?.body||'')).toLowerCase().includes(query);
  });
  host.innerHTML=rows.length?rows.map(c=>{
   const name=esc(c.title||c.peer?.display_name||c.peer?.handle||'ZOVARA member');
   const preview=esc(c.lastMessage?.body||((c.kind==='group'?'Group conversation':'Start a conversation')));
   const avatar=esc((c.title||c.peer?.display_name||c.peer?.handle||'Z').slice(0,1).toUpperCase());
   const time=fmt(c.lastMessage?.createdAt||c.createdAt);
   return '<button class="zv-conversation-item '+(c.id===currentId?'active':'')+'" data-inbox-open="'+esc(c.id)+'" data-peer-id="'+esc(c.peer?.id||'')+'"><span class="zv-chat-avatar">'+avatar+'</span><span class="zv-chat-summary"><b>'+name+'</b><small>'+preview+'</small></span><time>'+esc(time)+'</time>'+(c.preferences?.is_pinned?'<span class="zv-pin">◆</span>':'')+'</button>';
  }).join(''):'<div class="zv-inbox-list-empty">No conversations found. Start a new chat.</div>';
  renderOnlinePresence();
 }
 async function loadConversations(){
  if(!token())return;
  try{conversations=await api('/api/v1/conversations')||[];renderConversationList();}
  catch(error){$('zv-conversation-list').innerHTML='<div class="zv-inbox-list-empty">Your conversations could not be loaded. '+esc(error.message)+'</div>';}
 }
 function renderThreadEmpty(){
  $('zv-thread-empty').hidden=false;$('zv-thread-active').hidden=true;
  $('zv-thread-empty').innerHTML='<div class="zv-inbox-empty-icon">✉</div><h2>Your private space</h2><p>Choose a conversation or start a new one. Messages, voice notes, media and calls stay between their authorized participants.</p><button class="button primary" data-inbox-action="new-chat">New message</button>';
 }
 async function leaveConversationChannel(){
  if(channel&&realtime){await realtime.removeChannel(channel).catch(()=>{});}
  channel=null;
 }
 async function openConversation(id){
  const row=conversations.find(c=>c.id===id);if(!row)return;
  currentId=id;currentConversation=row;
  $('zv-thread-empty').hidden=true;$('zv-thread-active').hidden=false;
  $('zv-thread-name').textContent=row.title||row.peer?.display_name||row.peer?.handle||'Conversation';
  $('zv-thread-handle').textContent=row.kind==='group'?'Group conversation':(row.peer?.handle?'@'+row.peer.handle:'Private conversation');
  $('zv-thread-avatar').textContent=(row.title||row.peer?.display_name||row.peer?.handle||'Z').slice(0,1).toUpperCase();
  $('zv-message-composer').hidden=false;
  renderConversationList();
  await loadMessages(id);
  await leaveConversationChannel();
  if(await ensureRealtime()){
   channel=realtime.channel('conversation:'+id,{config:{private:true,presence:{key:profileId()}}})
    .on('broadcast',{event:'message.new'},()=>loadMessages(id))
    .on('broadcast',{event:'message.updated'},()=>loadMessages(id))
    .on('broadcast',{event:'message.deleted'},()=>loadMessages(id))
    .on('broadcast',{event:'message.receipt'},()=>loadMessages(id))
    .on('broadcast',{event:'typing'},payload=>showTyping(payload.payload||payload))
    .on('broadcast',{event:'message.reaction'},()=>loadMessages(id))
    .on('presence',{event:'sync'},()=>renderThreadPresence())
    .subscribe(async status=>{
      if(status==='SUBSCRIBED'&&messagingSettings.online_status_visible!==false){
       try{await channel.track({userId:profileId(),onlineAt:new Date().toISOString()});}catch{}
      }
    });
  }
 }
 function renderThreadPresence(){
  const node=$('zv-thread-presence');if(!node||!channel)return;
  const presence=channel.presenceState?.()||{};const ids=Object.values(presence).flat().map(x=>x.userId).filter(x=>x&&x!==profileId());
  node.textContent=ids.length?'Online':'';
 }
 function showTyping(payload){
  const userId=payload?.userId;if(!userId||userId===profileId())return;
  $('zv-thread-presence').textContent='Typing…';
  clearTimeout(typingStop);typingStop=setTimeout(()=>renderThreadPresence(),2500);
 }
 async function loadMessages(id){
  if(!token()||!id)return;
  try{
   const rows=await api('/api/v1/conversations/'+encodeURIComponent(id)+'/messages')||[];
   if(id!==currentId)return;
   const items=await Promise.all(rows.map(async m=>{
    let mediaUrl=null;if(m.media_id)mediaUrl=await signedMediaUrl(m.media_id);
    return {...m,mediaUrl};
   }));
   messages=items;renderMessages();
   $('zv-message-list').scrollTop=$('zv-message-list').scrollHeight;
   loadConversations();
  }catch(error){toast(error.message);}
 }
 function renderMessages(){
  const host=$('zv-message-list');if(!host)return;
  host.innerHTML=messages.length?messages.map(m=>{
   const mine=!!m.mine;const sender=esc(m.sender?.display_name||m.sender?.handle||'Member');
   let content=esc(m.body||'');
   if(m.mediaUrl){
    if(m.kind==='image')content='<img class="zv-message-image" src="'+esc(m.mediaUrl)+'" alt="Shared image">';
    else if(m.kind==='video')content='<video class="zv-message-video" src="'+esc(m.mediaUrl)+'" controls playsinline preload="metadata"></video>';
    else if(m.kind==='voice_note')content='<audio class="zv-message-audio" src="'+esc(m.mediaUrl)+'" controls preload="metadata"></audio>';
   }
   const reactions=(m.reactions||[]).map(r=>'<button class="zv-reaction '+(r.mine?'mine':'')+'" data-message-react="'+esc(m.id)+'" data-emoji="'+esc(r.emoji)+'">'+esc(r.emoji)+'</button>').join('');
   const receipts=mine?(m.receipts||[]).filter(r=>r.readAt).length?'Seen':(m.receipts||[]).filter(r=>r.deliveredAt).length?'Delivered':'Sent':'';
   const reply=m.reply_to?'<small class="zv-reply-label">Replying to a message</small>':'';
   return '<article class="zv-message '+(mine?'mine':'theirs')+'" data-message-id="'+esc(m.id)+'"><div class="zv-message-sender">'+(mine?'You':sender)+'</div><div class="zv-message-bubble">'+reply+content+'</div><div class="zv-message-meta">'+esc(fmt(m.created_at))+(m.edited_at?' · edited':'')+(receipts?' · '+receipts:'')+'</div><div class="zv-message-tools"><button data-message-react="'+esc(m.id)+'" data-emoji="❤️" title="React">❤️</button><button data-message-reply="'+esc(m.id)+'">Reply</button>'+(mine&&m.kind==='text'?'<button data-message-edit="'+esc(m.id)+'">Edit</button>':'')+(mine?'<button data-message-delete="'+esc(m.id)+'">Delete</button>':'')+'</div><div class="zv-message-reactions">'+reactions+'</div></article>';
  }).join(''):'<div class="zv-messages-empty">No messages yet. Say hello.</div>';
 }
 async function sendMessage({body='',kind='text',mediaId=null}={}){
  if(!currentId||!token())return;
  const clientMessageId='zv-msg-'+crypto.randomUUID();
  const reply=$('zv-replying-to')?.dataset.messageId||null;
  try{
   await api('/api/v1/conversations/'+encodeURIComponent(currentId)+'/messages',{method:'POST',headers:{'Idempotency-Key':clientMessageId},body:{body,kind,mediaId,replyTo:reply,clientMessageId}});
   $('zv-message-input').value='';$('zv-replying-to').hidden=true;delete $('zv-replying-to').dataset.messageId;
   await loadMessages(currentId);await loadConversations();
  }catch(error){toast(error.message,'error');}
 }
 async function uploadMedia(file,extra={}){
  if(!file)throw new Error('Choose a file first.');
  const mime=file.type||'application/octet-stream';
  const signed=await api('/api/v1/media/upload-url',{method:'POST',body:{filename:file.name||'attachment',mimeType:mime,size:file.size}});
  const response=await fetch(signed.uploadUrl,{method:'PUT',headers:{'Content-Type':mime,'x-upsert':'false'},body:file});
  if(!response.ok)throw new Error('The media upload did not finish.');
  const asset=await api('/api/v1/media/complete',{method:'POST',body:{path:signed.path,mimeType:mime,size:file.size,width:extra.width,height:extra.height,durationMs:extra.durationMs,altText:extra.altText||''}});
  return asset;
 }
 async function attachFile(file){
  try{
   const asset=await uploadMedia(file);const kind=asset.media_type==='video'?'video':asset.media_type==='audio'?'voice_note':'image';
   await sendMessage({body:'',kind,mediaId:asset.id});
  }catch(error){toast(error.message,'error');}
 }
 async function toggleVoiceRecording(){
  if(recorder?.state==='recording'){recorder.stop();return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Voice recording is not supported in this browser.','error');return;}
  try{
   recordStream=await navigator.mediaDevices.getUserMedia({audio:true});
   const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(x=>MediaRecorder.isTypeSupported?.(x))||'';
   recorder=new MediaRecorder(recordStream,mime?{mimeType:mime}:undefined);recordChunks=[];
   recorder.ondataavailable=e=>{if(e.data?.size)recordChunks.push(e.data);};
   recorder.onstop=async()=>{
    const blob=new Blob(recordChunks,{type:recorder.mimeType||'audio/webm'});recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;recorder=null;
    const file=new File([blob],'voice-note.'+(blob.type.includes('mp4')?'m4a':'webm'),{type:blob.type});
    await attachFile(file);
   };
   recorder.start();$('zv-record-voice').textContent='Stop voice note';$('zv-record-voice').classList.add('recording');
  }catch(error){recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;toast(error.message||'Microphone permission was not granted.','error');}
 }
 function stopRecording(){if(recorder?.state==='recording')recorder.stop();else recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;}
 async function searchPeople(q){
  const host=$('zv-people-results');if(!host)return;
  if(q.trim().length<2){host.innerHTML='<p class="muted">Enter at least two characters to search creators.</p>';return;}
  try{
   const rows=await api('/api/v1/search/profiles?q='+encodeURIComponent(q.trim()));
   host.innerHTML=(rows||[]).map(p=>'<button type="button" class="zv-person-result" data-person-id="'+esc(p.id)+'" data-person-name="'+esc(p.display_name||p.handle)+'"><span class="zv-chat-avatar">'+esc((p.display_name||p.handle||'Z').slice(0,1).toUpperCase())+'</span><span><b>'+esc(p.display_name||p.handle)+'</b><small>@'+esc(p.handle)+'</small></span><span class="zv-person-add">+</span></button>').join('')||'<p class="muted">No matching public creators were found.</p>';
  }catch(error){host.textContent=error.message;}
 }
 async function beginDirect(id){
  try{
   const created=await api('/api/v1/conversations/direct',{method:'POST',body:{userId:id}});
   $('zv-new-chat-dialog').close();await loadConversations();await openConversation(created.id);
  }catch(error){toast(error.message,'error');}
 }
 async function createGroup(){
  const ids=[...selectedMembers.keys()];
  if(ids.length<2){toast('Choose at least two other members for a group.','error');return;}
  try{
   const created=await api('/api/v1/conversations',{method:'POST',body:{title:$('zv-group-title').value.trim(),memberIds:ids}});
   $('zv-new-chat-dialog').close();selectedMembers.clear();renderSelectedMembers();$('zv-group-title').value='';await loadConversations();await openConversation(created.id);
  }catch(error){toast(error.message,'error');}
 }
 function renderSelectedMembers(){
  if(!selectedGroup)return;
  selectedGroup.innerHTML=[...selectedMembers.entries()].map(([id,name])=>'<span class="zv-selected-chip">'+esc(name)+' <button type="button" data-remove-member="'+esc(id)+'" aria-label="Remove '+esc(name)+'">×</button></span>').join('');
 }
 async function setConversationPreference(key,value){
  if(!currentId)return;
  try{
   await api('/api/v1/conversations/'+encodeURIComponent(currentId)+'/preferences',{method:'PATCH',body:{[key]:value}});
   const row=conversations.find(c=>c.id===currentId);if(row)row.preferences={...(row.preferences||{}),[key]:value};renderConversationList();
   if(key==='is_archived'){currentId=null;currentConversation=null;renderThreadEmpty();}
  }catch(error){toast(error.message,'error');}
 }
 async function showCallHistory(){
  const host=$('zv-call-history');if(!host||!currentId)return;
  if(!host.hidden){host.hidden=true;return;}
  host.hidden=false;host.innerHTML='<p class="muted">Loading call history…</p>';
  try{
   const rows=await api('/api/v1/conversations/'+encodeURIComponent(currentId)+'/calls');
   host.innerHTML=(rows||[]).map(c=>{
    const duration=Number(c.duration_seconds)||0;const time=fmt(c.created_at);
    const status=String(c.status||'unknown').replaceAll('_',' ');
    return '<div class="zv-call-history-row"><span class="zv-call-history-icon">'+(c.call_type==='video'?'▣':'☎')+'</span><span><b>'+(c.call_type==='video'?'Video call':'Voice call')+'</b><small>'+esc(time)+' · '+esc(status)+(duration?' · '+Math.floor(duration/60)+':'+String(duration%60).padStart(2,'0'):'')+'</small></span></div>';
   }).join('')||'<p class="muted">No calls in this conversation yet.</p>';
  }catch(error){host.innerHTML='<p class="muted">Call history could not be loaded: '+esc(error.message)+'</p>';}
 }
 async function refreshIncomingCalls(){
  if(!token())return;
  if(messagingSettings.call_notifications_enabled===false){if(incomingCard)incomingCard.hidden=true;return;}
  try{
   const calls=await api('/api/v1/calls/incoming');
   if(callId||!calls?.length){if(incomingCard)incomingCard.hidden=true;return;}
   const call=calls[0];if(incomingCard){incomingCard.hidden=false;incomingCard.dataset.callId=call.id;incomingCard.dataset.conversationId=call.conversationId;$('zv-incoming-name').textContent=call.caller?.display_name||call.caller?.handle||'ZOVARA member';$('zv-incoming-kind').textContent=(call.callType==='video'?'Video':'Voice')+' call';}
  }catch{}
 }
 async function startCall(type){
  if(!currentId){toast('Open a conversation before starting a call.');return;}
  if(!window.LivekitClient){toast('The call media player has not loaded. Refresh the page and try again.','error');return;}
  try{
   const data=await api('/api/v1/conversations/'+encodeURIComponent(currentId)+'/calls',{method:'POST',body:{callType:type}});
   callId=data.callId;callType=type;callIsCaller=true;await connectCall(data);
  }catch(error){toast(error.message,'error');}
 }
 async function decideCall(action){
  const id=incomingCard?.dataset.callId;if(!id)return;
  try{
   const data=await api('/api/v1/calls/'+encodeURIComponent(id)+'/decision',{method:'POST',body:{action}});
   incomingCard.hidden=true;
   if(action==='accept'){callId=id;callType=data.callType;callIsCaller=false;await connectCall(data);}
   else await refreshIncomingCalls();
  }catch(error){toast(error.message,'error');}
 }
 function createCallTile(identity,label){
  const tile=document.createElement('div');tile.className='zv-call-tile';tile.dataset.identity=identity;
  const title=document.createElement('span');title.className='zv-call-tile-label';title.textContent=label||identity;tile.append(title);callGrid.append(tile);return tile;
 }
 function attachTrack(track,participant){
  if(!callGrid||!participant)return;
  let tile=callGrid.querySelector('[data-identity="'+CSS.escape(participant.identity)+'"]');
  if(!tile)tile=createCallTile(participant.identity,participant.name||participant.identity);
  const media=track.attach();media.className='zv-call-media';
  if(track.kind==='audio'){media.autoplay=true;media.playsInline=true;}
  else{media.autoplay=true;media.playsInline=true;media.muted=participant.identity===profileId();}
  tile.querySelectorAll('video,audio').forEach(x=>x.remove());tile.prepend(media);
 }
 async function connectCall(data){
  callOverlay.hidden=false;callGrid.innerHTML='';callLabel.textContent=callType==='video'?'Video call':'Voice call';
  const LK=window.LivekitClient;const room=new LK.Room({adaptiveStream:true,dynacast:true});callRoom=room;
  const E=LK.RoomEvent||{};
  if(E.TrackSubscribed)room.on(E.TrackSubscribed,(track,publication,participant)=>attachTrack(track,participant));
  if(E.TrackUnsubscribed)room.on(E.TrackUnsubscribed,(track)=>track.detach().forEach(n=>n.remove()));
  if(E.ParticipantDisconnected)room.on(E.ParticipantDisconnected,p=>callGrid.querySelector('[data-identity="'+CSS.escape(p.identity)+'"]')?.remove());
  if(E.Disconnected)room.on(E.Disconnected,()=>{callOverlay.hidden=true;callGrid.innerHTML='';callRoom=null;callId=null;refreshIncomingCalls();});
  try{
   await room.connect(data.serverUrl,data.token);
   await room.localParticipant.setMicrophoneEnabled(true);callMic=true;
   if(callType==='video'){await room.localParticipant.setCameraEnabled(true);callCamera=true;}
   for(const p of [room.localParticipant,...room.remoteParticipants.values()]){
    for(const pub of p.trackPublications.values())if(pub.track)attachTrack(pub.track,p);
    if(!callGrid.querySelector('[data-identity="'+CSS.escape(p.identity)+'"]'))createCallTile(p.identity,p.name||p.identity);
   }
   updateCallControls();
  }catch(error){await room.disconnect().catch(()=>{});callRoom=null;callId=null;callOverlay.hidden=true;toast('Could not connect the call: '+error.message,'error');}
 }
 function updateCallControls(){
  $('zv-call-mic').textContent=callMic?'Mute microphone':'Unmute microphone';
  $('zv-call-camera').hidden=callType==='audio';$('zv-call-screen').hidden=callType==='audio';
  $('zv-call-camera').textContent=callCamera?'Turn camera off':'Turn camera on';
  $('zv-call-screen').textContent=screenShare?'Stop screen share':'Share screen';
 }
 async function endCall(notify=true){
  const id=callId;const room=callRoom;callId=null;callRoom=null;
  if(room)await room.disconnect().catch(()=>{});
  if(notify&&id){try{await api('/api/v1/calls/'+encodeURIComponent(id)+'/decision',{method:'POST',body:{action:callIsCaller?'end':'leave'}});}catch(error){toast(error.message,'error');}}
  callOverlay.hidden=true;callGrid.innerHTML='';callType=null;screenShare=false;await refreshIncomingCalls();await loadConversations();
 }
 async function handleCallControl(action){
  if(!callRoom)return;
  try{
   if(action==='mic'){callMic=!callMic;await callRoom.localParticipant.setMicrophoneEnabled(callMic);}
   if(action==='camera'){callCamera=!callCamera;await callRoom.localParticipant.setCameraEnabled(callCamera);}
   if(action==='screen'){screenShare=!screenShare;await callRoom.localParticipant.setScreenShareEnabled(screenShare);}
   if(action==='switch-camera'){
    const pub=callRoom.localParticipant.getTrackPublication(window.LivekitClient.Track.Source.Camera);
    if(pub?.track)await pub.track.restartTrack({facingMode:state.cameraFacing==='user'?'environment':'user'});
    state.cameraFacing=state.cameraFacing==='user'?'environment':'user';
   }
   updateCallControls();
  }catch(error){toast(error.message,'error');}
 }
 function typeStart(){
  if(!channel||!state.me?.profile?.id||messagingSettings.typing_indicators_enabled===false)return;
  try{channel.send({type:'broadcast',event:'typing',payload:{userId:profileId(),name:state.me.profile.display_name}});}catch{}
  clearTimeout(typingTimer);typingTimer=setTimeout(()=>{try{channel?.send({type:'broadcast',event:'typing',payload:{userId:profileId(),stopped:true}});}catch{}},1200);
 }
 incomingCard?.addEventListener('click',async e=>{const button=e.target.closest('[data-call-incoming]');if(button)await decideCall(button.dataset.callIncoming);});
 callOverlay?.addEventListener('click',async e=>{const button=e.target.closest('[data-call-control]');if(!button)return;if(button.dataset.callControl==='end')await endCall(true);else await handleCallControl(button.dataset.callControl);});
 root.addEventListener('click',async e=>{
  const open=e.target.closest('[data-inbox-open]');if(open){await openConversation(open.dataset.inboxOpen);return;}
  const person=e.target.closest('[data-person-id]');if(person){
   const id=person.dataset.personId,name=person.dataset.personName||'Member';
   if($('zv-new-chat-dialog')?.dataset.mode==='group'){
    selectedMembers.set(id,name);renderSelectedMembers();person.classList.add('selected');
   }else await beginDirect(id);
   return;
  }
  const remove=e.target.closest('[data-remove-member]');if(remove){selectedMembers.delete(remove.dataset.removeMember);renderSelectedMembers();return;}
  const reply=e.target.closest('[data-message-reply]');if(reply){const m=messages.find(x=>x.id===reply.dataset.messageReply);$('zv-replying-to').hidden=false;$('zv-replying-to').dataset.messageId=m?.id||'';$('zv-replying-to').textContent='Replying to: '+(m?.body||m?.kind||'message')+'  ×';$('zv-message-input').focus();return;}
  const edit=e.target.closest('[data-message-edit]');if(edit){const m=messages.find(x=>x.id===edit.dataset.messageEdit);const body=prompt('Edit message',m?.body||'');if(body!==null&&body.trim()){try{await api('/api/v1/messages/'+encodeURIComponent(m.id),{method:'PATCH',body:{body}});await loadMessages(currentId);}catch(error){toast(error.message,'error');}}return;}
  const del=e.target.closest('[data-message-delete]');if(del){if(confirm('Delete this message for everyone in this conversation?')){try{await api('/api/v1/messages/'+encodeURIComponent(del.dataset.messageDelete),{method:'DELETE'});await loadMessages(currentId);}catch(error){toast(error.message,'error');}}return;}
  const reaction=e.target.closest('[data-message-react]');if(reaction){const emoji=reaction.dataset.emoji||'❤️';try{await api('/api/v1/messages/'+encodeURIComponent(reaction.dataset.messageReact)+'/reactions',{method:'POST',body:{emoji}});await loadMessages(currentId);}catch(error){toast(error.message,'error');}return;}
  const pref=e.target.closest('[data-inbox-pref]');if(pref){const key=pref.dataset.inboxPref;const row=conversations.find(c=>c.id===currentId);await setConversationPreference(key,!row?.preferences?.[key]);return;}
  const incoming=e.target.closest('[data-call-incoming]');if(incoming){await decideCall(incoming.dataset.callIncoming);return;}
  const ctrl=e.target.closest('[data-call-control]');if(ctrl){if(ctrl.dataset.callControl==='end')await endCall(true);else await handleCallControl(ctrl.dataset.callControl);return;}
  const act=e.target.closest('[data-inbox-action]');if(act){
   if(act.dataset.inboxAction==='new-chat')$('zv-new-chat-dialog').showModal();
   if(act.dataset.inboxAction==='close-reply'){$('zv-replying-to').hidden=true;delete $('zv-replying-to').dataset.messageId;}
   if(act.dataset.inboxAction==='group'){$('zv-new-chat-dialog').dataset.mode='group';$('zv-new-chat-title').textContent='Create a group';$('zv-group-fields').hidden=false;selectedMembers.clear();renderSelectedMembers();if(!$('zv-new-chat-dialog').open)$('zv-new-chat-dialog').showModal();}
   if(act.dataset.inboxAction==='direct'){$('zv-new-chat-dialog').dataset.mode='direct';$('zv-new-chat-title').textContent='New message';$('zv-group-fields').hidden=true;}
   if(act.dataset.inboxAction==='create-group')await createGroup();
   if(act.dataset.inboxAction==='voice-note')await toggleVoiceRecording();
   if(act.dataset.inboxAction==='attach')$('zv-message-file').click();
   if(act.dataset.inboxAction==='call-history')await showCallHistory();
   if(act.dataset.inboxAction==='audio-call')await startCall('audio');
   if(act.dataset.inboxAction==='video-call')await startCall('video');
   if(act.dataset.inboxAction==='archive')await setConversationPreference('is_archived',true);
   if(act.dataset.inboxAction==='pin'){const row=conversations.find(c=>c.id===currentId);await setConversationPreference('is_pinned',!row?.preferences?.is_pinned);}
   if(act.dataset.inboxAction==='mute'){const row=conversations.find(c=>c.id===currentId);await setConversationPreference('is_muted',!row?.preferences?.is_muted);}
  }
 });
 $('zv-inbox-search')?.addEventListener('input',renderConversationList);
 $('zv-people-search')?.addEventListener('input',e=>searchPeople(e.target.value));
 $('zv-message-form')?.addEventListener('submit',e=>{e.preventDefault();const body=$('zv-message-input').value.trim();if(body)sendMessage({body,kind:'text'});});
 $('zv-message-input')?.addEventListener('input',typeStart);
 $('zv-message-file')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)attachFile(f);e.target.value='';});
 $('zv-inbox-close-dialog')?.addEventListener('click',()=>$('zv-new-chat-dialog').close());
 $('zv-call-close')?.addEventListener('click',()=>endCall(true));
 $('zv-incoming-dismiss')?.addEventListener('click',()=>{incomingCard.hidden=true;});
 window.ZovaraInbox={show,signedIn,logout,openConversation};
 renderThreadEmpty();renderConversationList();
}
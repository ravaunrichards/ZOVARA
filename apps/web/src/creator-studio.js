export function initCreatorStudio({api,token,state,toast}){
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let mode='video',items=[],cameraStream=null,recorder=null,recordChunks=[],recordStart=0,currentDraftId=null;
 const stage=$('studio-preview-stage');
 if(!stage)return;
 const effectMap={normal:'none',warm:'sepia(.22) saturate(1.25)',cool:'hue-rotate(12deg) saturate(1.08)',mono:'grayscale(1)',vivid:'saturate(1.55) contrast(1.08)',dream:'brightness(1.08) saturate(1.25) blur(.15px)'};
 function switchMode(next){
  mode=next;
  document.querySelectorAll('[data-studio-mode]').forEach(b=>b.classList.toggle('active',b.dataset.studioMode===mode));
  const file=$('studio-file');file.accept=mode==='photo'?'image/*':mode==='video'?'video/*':'image/*,video/*';
  file.multiple=mode==='photo';
  $('studio-media-label').textContent=mode==='photo'?'Choose photos':'Choose a video or photo';
  $('studio-camera-start').hidden=mode==='text';$('studio-record').hidden=mode!=='video';
  renderPreview();
 }
 function setPreviewEffect(){
  const effect=$('studio-effect')?.value||'normal';
  const style=effectMap[effect]||'none';
  $('studio-preview-image').style.filter=style;
  $('studio-preview-video').style.filter=style;
  $('studio-camera-preview').style.filter=style;
  $('studio-preview-overlay').textContent=$('studio-overlay-text').value.trim();
  $('studio-preview-sticker').textContent=$('studio-sticker').value||'';
 }
 function updateSpeed(){
  const speed=Number($('studio-speed').value)||1;
  $('studio-preview-video').playbackRate=speed;
  $('studio-camera-preview').playbackRate=speed;
 }
 function renderPreview(){
  const image=$('studio-preview-image'),video=$('studio-preview-video'),camera=$('studio-camera-preview'),placeholder=$('studio-preview-placeholder');
  image.hidden=true;video.hidden=true;camera.hidden=true;placeholder.hidden=true;
  if(cameraStream){camera.srcObject=cameraStream;camera.hidden=false;camera.play().catch(()=>{});}
  else if(items.length){
   const item=items[0];if(item.type.startsWith('video/')){video.src=item.url;video.hidden=false;video.playbackRate=Number($('studio-speed').value)||1;}
   else{image.src=item.url;image.hidden=false;}
  }else if(mode==='text'){
   placeholder.hidden=false;placeholder.textContent='Your text post preview';
  }else{
   placeholder.hidden=false;placeholder.textContent='Your next post starts here';
  }
  setPreviewEffect();updateSpeed();
  $('studio-media-count').textContent=items.length?items.length+' media item'+(items.length===1?'':'s'):'No media selected';
  $('studio-media-thumbnails').innerHTML=items.map((m,i)=>'<button type="button" class="studio-thumb '+(i===0?'active':'')+'" data-studio-remove="'+i+'" title="Remove media">'+(m.type.startsWith('video/')?'<video src="'+esc(m.url)+'" muted></video>':'<img src="'+esc(m.url)+'" alt="">')+'<span>×</span></button>').join('');
 }
 function clearItems(){for(const item of items)if(item.url?.startsWith('blob:'))URL.revokeObjectURL(item.url);items=[];currentDraftId=null;renderPreview();}
 function addFiles(files){
  const incoming=[...files];if(mode==='photo'&&items.length+incoming.length>10){toast('A photo post can contain up to 10 images.','error');return;}
  if(mode==='video'&&incoming.some(f=>f.type.startsWith('video/'))&&incoming.length>1){toast('Choose one video per video post.','error');return;}
  for(const file of incoming){
   if(!file.type.startsWith('image/')&&!file.type.startsWith('video/')){toast('Choose a photo or video file.','error');continue;}
   if(file.size>500*1024*1024){toast('Each media file must be 500 MB or smaller.','error');continue;}
   if(items.length>=10){toast('A post can contain up to 10 media items.','error');break;}
   items.push({file,url:URL.createObjectURL(file),type:file.type,assetId:null});
  }
  renderPreview();
 }
 async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){toast('Camera access is not supported in this browser.','error');return;}
  try{
   cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:state.cameraFacing||'user',width:{ideal:1080},height:{ideal:1920}},audio:true});
   $('studio-camera-preview').srcObject=cameraStream;$('studio-camera-preview').hidden=false;
   $('studio-preview-image').hidden=true;$('studio-preview-video').hidden=true;$('studio-preview-placeholder').hidden=true;
   $('studio-camera-start').textContent='Close camera';toast('Camera ready. Recording starts only when you tap Record.','success');
  }catch(error){toast(error.message||'Camera or microphone permission was not granted.','error');}
 }
 async function toggleRecord(){
  if(recorder?.state==='recording'){recorder.stop();return;}
  if(!cameraStream)await startCamera();
  if(!cameraStream)return;
  if(!window.MediaRecorder){toast('Video recording is not supported in this browser.','error');return;}
  try{
   const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(x=>MediaRecorder.isTypeSupported?.(x))||'';
   recorder=new MediaRecorder(cameraStream,mime?{mimeType:mime}:undefined);recordChunks=[];recordStart=Date.now();
   recorder.ondataavailable=e=>{if(e.data?.size)recordChunks.push(e.data);};
   recorder.onstop=()=>{
    const blob=new Blob(recordChunks,{type:recorder.mimeType||'video/webm'});
    const file=new File([blob],'zovara-video.'+(blob.type.includes('mp4')?'mp4':'webm'),{type:blob.type});
    const url=URL.createObjectURL(blob);items=[{file,url,type:blob.type,assetId:null}];
    stopCamera();recorder=null;renderPreview();toast('Video recorded. Add a caption and publish when ready.','success');
   };
   recorder.start(500);$('studio-record').textContent='Stop recording';$('studio-record').classList.add('recording');
   $('studio-record-timer').hidden=false;
  }catch(error){toast(error.message,'error');}
 }
 function stopCamera(){
  cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;
  $('studio-camera-preview').srcObject=null;$('studio-camera-preview').hidden=true;
  $('studio-camera-start').textContent='Open camera';$('studio-record').textContent='Record video';$('studio-record').classList.remove('recording');$('studio-record-timer').hidden=true;
 }
 async function uploadItem(item){
  if(item.assetId)return item.assetId;
  const file=item.file;if(!file)throw new Error('This draft media file is not available on this device. Please add it again.');
  const signed=await api('/api/v1/media/upload-url',{method:'POST',body:{filename:file.name,mimeType:file.type,size:file.size}});
  const response=await fetch(signed.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
  if(!response.ok)throw new Error('Media upload failed. Please try again.');
  const asset=await api('/api/v1/media/complete',{method:'POST',body:{path:signed.path,mimeType:file.type,size:file.size}});
  item.assetId=asset.id;return asset.id;
 }
 function hashtags(){
  return $('studio-hashtags').value.split(/[,\s]+/).map(x=>x.trim().replace(/^#/,'')).filter(Boolean).slice(0,30);
 }
 function metadata(){
  return {effect:$('studio-effect').value,speed:Number($('studio-speed').value)||1,overlayText:$('studio-overlay-text').value.trim().slice(0,100),sticker:$('studio-sticker').value,allowDuet:$('studio-allow-duet').checked,allowStitch:$('studio-allow-stitch').checked,allowDownload:$('studio-allow-download').checked};
 }
 async function saveDraft(){
  if(!token()){toast('Sign in to save drafts.');return;}
  try{
   const mediaIds=[];for(const item of items)mediaIds.push(await uploadItem(item));
   const payload={caption:$('studio-caption').value,hashtags:hashtags(),visibility:$('studio-visibility').value,mediaIds,commentsEnabled:$('studio-comments').checked,metadata:metadata()};
   const draft=currentDraftId?await api('/api/v1/drafts/'+encodeURIComponent(currentDraftId),{method:'PATCH',body:payload}):await api('/api/v1/drafts',{method:'POST',body:payload});
   currentDraftId=draft.id;toast('Draft saved.','success');
  }catch(error){toast(error.message,'error');}
 }
 async function publish(){
  if(!token()){toast('Sign in to publish content.');return;}
  const button=$('studio-publish');button.disabled=true;
  try{
   const mediaIds=[];for(const item of items)mediaIds.push(await uploadItem(item));
   await api('/api/v1/posts',{method:'POST',body:{body:$('studio-caption').value.trim(),hashtags:hashtags(),visibility:$('studio-visibility').value,mediaIds,commentsEnabled:$('studio-comments').checked,creationOptions:metadata()}});
   if(currentDraftId)await api('/api/v1/drafts/'+encodeURIComponent(currentDraftId),{method:'DELETE'}).catch(()=>{});
   toast('Your post has been published.','success');clearItems();$('studio-caption').value='';$('studio-hashtags').value='';$('studio-overlay-text').value='';
   window.dispatchEvent(new CustomEvent('zovara:published'));
  }catch(error){toast(error.message,'error');}
  finally{button.disabled=false;}
 }
 async function openDrafts(){
  if(!token()){toast('Sign in to open drafts.');return;}
  try{
   const drafts=await api('/api/v1/drafts');$('studio-drafts-list').innerHTML=(drafts||[]).map(d=>'<article class="studio-draft"><div><b>'+esc(d.caption||'Untitled draft')+'</b><small>'+esc(d.visibility)+' · '+esc(new Date(d.updated_at).toLocaleString())+' · '+(d.media_ids?.length||0)+' media</small></div><button type="button" data-draft-load="'+esc(d.id)+'">Open</button><button type="button" data-draft-delete="'+esc(d.id)+'">Delete</button></article>').join('')||'<p class="muted">No saved drafts.</p>';
   $('studio-drafts-dialog').showModal();
  }catch(error){toast(error.message,'error');}
 }
 async function loadDraft(id){
  try{
   const drafts=await api('/api/v1/drafts');const draft=(drafts||[]).find(x=>x.id===id);if(!draft)return;
   clearItems();currentDraftId=draft.id;$('studio-caption').value=draft.caption||'';$('studio-hashtags').value=(draft.hashtags||[]).map(x=>'#'+x).join(' ');$('studio-visibility').value=draft.visibility||'public';$('studio-comments').checked=draft.comments_enabled!==false;
   const options=draft.draft_metadata||{};if(options.effect)$('studio-effect').value=options.effect;if(options.speed)$('studio-speed').value=String(options.speed);$('studio-overlay-text').value=options.overlayText||'';if(options.sticker)$('studio-sticker').value=options.sticker;
   for(const id of draft.media_ids||[]){
    try{const media=await api('/api/v1/media/view-url?id='+encodeURIComponent(id));items.push({assetId:id,url:media.url,type:media.mediaType==='video'?(media.mimeType||'video/mp4'):(media.mimeType||'image/jpeg')});}catch{}
   }
   renderPreview();$('studio-drafts-dialog').close();toast('Draft opened.','success');
  }catch(error){toast(error.message,'error');}
 }
 stage.addEventListener('click',e=>{const remove=e.target.closest('[data-studio-remove]');if(remove){const i=Number(remove.dataset.studioRemove);const item=items[i];if(item?.url?.startsWith('blob:'))URL.revokeObjectURL(item.url);items.splice(i,1);renderPreview();}});
 document.querySelectorAll('[data-studio-mode]').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.studioMode)));
 $('studio-file')?.addEventListener('change',e=>{addFiles(e.target.files||[]);e.target.value='';});
 $('studio-camera-start')?.addEventListener('click',()=>cameraStream?stopCamera():startCamera());
 $('studio-record')?.addEventListener('click',toggleRecord);
 $('studio-effect')?.addEventListener('change',setPreviewEffect);
 $('studio-speed')?.addEventListener('change',updateSpeed);
 $('studio-overlay-text')?.addEventListener('input',setPreviewEffect);
 $('studio-sticker')?.addEventListener('change',setPreviewEffect);
 $('studio-publish')?.addEventListener('click',publish);
 $('studio-save-draft')?.addEventListener('click',saveDraft);
 $('studio-open-drafts')?.addEventListener('click',openDrafts);
 $('studio-drafts-close')?.addEventListener('click',()=>$('studio-drafts-dialog').close());
 $('studio-drafts-list')?.addEventListener('click',e=>{
  const load=e.target.closest('[data-draft-load]');if(load){loadDraft(load.dataset.draftLoad);return;}
  const del=e.target.closest('[data-draft-delete]');if(del&&confirm('Delete this saved draft?'))api('/api/v1/drafts/'+encodeURIComponent(del.dataset.draftDelete),{method:'DELETE'}).then(openDrafts).catch(error=>toast(error.message,'error'));
 });
 $('studio-camera-flip')?.addEventListener('click',async()=>{
  if(!cameraStream){toast('Open the camera first.');return;}
  stopCamera();state.cameraFacing=state.cameraFacing==='environment'?'user':'environment';await startCamera();
 });
 $('studio-clear-media')?.addEventListener('click',clearItems);
 window.addEventListener('beforeunload',stopCamera);
 window.ZovaraCreator={show(){renderPreview();},signedIn(){},cleanup:stopCamera};
 switchMode('video');renderPreview();
}
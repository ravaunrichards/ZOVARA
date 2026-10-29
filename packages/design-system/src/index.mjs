export const TOKENS = Object.freeze({
  color:{ink:'#10172a',night:'#080b18',surface:'#141a2d',surfaceRaised:'#202941',violet:'#8c6bff',aqua:'#45e0d0',coral:'#ff719c',gold:'#ffd878',text:'#f4f6ff',muted:'#a5aec7',danger:'#ff5a72',success:'#5ed9a4'},
  spacing:{xs:4,sm:8,md:16,lg:24,xl:32,xxl:48}, radius:{sm:8,md:14,lg:22,pill:999}, icon:{xs:14,sm:18,md:22,lg:28,xl:36}, motion:{fast:120,normal:220,slow:420}
});
export function styleConfigurationId(palette,material,shape,motion) { return `style-${palette}-${material}-${shape}-${motion}`; }

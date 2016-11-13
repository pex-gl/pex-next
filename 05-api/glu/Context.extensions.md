# Cesium

https://github.com/AnalyticalGraphicsInc/cesium/blob/969cdc35c2d81dfe7a6c1ae12be1c005e7a30def/Source/Renderer/Context.js#L730

```
//checking
 this._elementIndexUint = getExtension(gl, ['OES_element_index_uint']);

//property
elementIndexUint : {
            get : function() {
                return !!this._elementIndexUint;
            }
        },

//usage
if (context.elementIndexUint) {
```

# BGFX

```
//definition
#define BGFX_CAPS_INSTANCING             UINT64_C(0x0000000000000010)

//check
if (BX_ENABLED(BGFX_CONFIG_RENDERER_OPENGLES >= 30) )
{
	g_caps.supported |= BGFX_CAPS_INSTANCING;
}
else
{
	if (!BX_ENABLED(BX_PLATFORM_IOS) )
	{
		if (s_extension[Extension::ARB_instanced_arrays].m_supported
		||  s_extension[Extension::ANGLE_instanced_arrays].m_supported)
		{
			if (NULL != glVertexAttribDivisor
			&&  NULL != glDrawArraysInstanced
			&&  NULL != glDrawElementsInstanced)
			{
				g_caps.supported |= BGFX_CAPS_INSTANCING;
			}
		}
	}
	...
}


//usage
BX_CHECK(0 != (g_caps.supported & BGFX_CAPS_INSTANCING), "Instancing is not supported! Use bgfx::getCaps to check backend renderer capabilities.");
		
```
import { FRAG, VERT } from './shaders'

export interface HalftoneUniforms {
  dotScale: number
  contrast: number
  brightness: number
  saturation: number
  shadows: number
  highlights: number
  /** radians */
  angles: [number, number, number, number]
  sharpness: number
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error('Shader compile error: ' + log)
  }
  return sh
}

/** Single fullscreen-quad WebGL pass that applies the CMYK halftone shader. */
export class HalftoneGL {
  readonly canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private tex: WebGLTexture
  private u: Record<string, WebGLUniformLocation | null>

  constructor() {
    this.canvas = document.createElement('canvas')
    const gl = this.canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    })
    if (!gl) throw new Error('WebGL not available')
    this.gl = gl

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(program))
    }
    this.program = program

    // Fullscreen quad (two triangles).
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    this.tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.u = {
      uImage: gl.getUniformLocation(program, 'uImage'),
      uResolution: gl.getUniformLocation(program, 'uResolution'),
      uDotScale: gl.getUniformLocation(program, 'uDotScale'),
      uContrast: gl.getUniformLocation(program, 'uContrast'),
      uBrightness: gl.getUniformLocation(program, 'uBrightness'),
      uSaturation: gl.getUniformLocation(program, 'uSaturation'),
      uShadows: gl.getUniformLocation(program, 'uShadows'),
      uHighlights: gl.getUniformLocation(program, 'uHighlights'),
      uAngles: gl.getUniformLocation(program, 'uAngles'),
      uSharpness: gl.getUniformLocation(program, 'uSharpness'),
    }
  }

  /** Render `source` (already cover-fitted to w×h) with the halftone shader. */
  render(
    source: TexImageSource,
    w: number,
    h: number,
    p: HalftoneUniforms,
  ): HTMLCanvasElement {
    const gl = this.gl
    this.canvas.width = w
    this.canvas.height = h
    gl.viewport(0, 0, w, h)
    gl.useProgram(this.program)

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.uniform1i(this.u.uImage, 0)

    gl.uniform2f(this.u.uResolution, w, h)
    gl.uniform1f(this.u.uDotScale, Math.max(2, p.dotScale))
    gl.uniform1f(this.u.uContrast, p.contrast)
    gl.uniform1f(this.u.uBrightness, p.brightness)
    gl.uniform1f(this.u.uSaturation, p.saturation)
    gl.uniform1f(this.u.uShadows, p.shadows)
    gl.uniform1f(this.u.uHighlights, p.highlights)
    gl.uniform4f(this.u.uAngles, ...p.angles)
    gl.uniform1f(this.u.uSharpness, p.sharpness)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
    return this.canvas
  }
}

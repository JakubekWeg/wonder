import { CODE_STATS_LINES_COUNT, COMMIT_HASH, DEBUG } from '../../util/build-info'
import { sharedMemoryIsAvailable } from '../../util/shared-memory'
import { createElement } from '../utils'

export default (root: HTMLElement) => {
	const p = createElement('p', root, 'build-info')
	p['innerText'] = [
		`Build ${COMMIT_HASH} (${DEBUG ? 'debug' : 'production'}) • Lines of code: ${CODE_STATS_LINES_COUNT}`,
		`Shared memory: ${sharedMemoryIsAvailable ? '' : 'un'}available • Offscreen canvas: ${!!((window as any).OffscreenCanvas) ? '' : 'un'}available`,
		`Renderer: ${getRendererName() ?? 'unknown'}`,
	].join('\n')
}

const getRendererName = (): string | null => {
	const canvas = document['createElement']('canvas')
	const gl = canvas.getContext('webgl2')
	if (gl) {
		const ext = gl['getExtension']('WEBGL_debug_renderer_info') as any
		if (ext) {
			const value = gl['getParameter'](ext['UNMASKED_RENDERER_WEBGL'])
			if (value)
				return `${value}`
		}
	}
	return null
}


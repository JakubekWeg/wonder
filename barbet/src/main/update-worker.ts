import { SaveMethod } from './environments/loader'
import { GameStateImplementation } from './game-state/game-state'
import { ReceiveActionsQueue } from './game-state/scheduled-actions/queue'
import { createNewStateUpdater } from './game-state/state-updater'
import { putSaveData } from './util/persistance/saves-database'
import { ArrayEncodingType, setArrayEncodingType } from './util/persistance/serializers'
import { takeControlOverWorkerConnection } from './worker/connections-manager'
import { setMessageHandler } from './worker/message-handler'
import SettingsContainer from './worker/observable-settings'
import {
	globalActionsQueue,
	globalGameState,
	globalStateUpdater,
	setGlobalActionsQueue,
	setGlobalGameState,
	setGlobalMutex,
	setGlobalStateUpdater,
} from './worker/worker-global-state'
import { createEmptyGame, loadGameFromDb, loadGameFromFile } from './worker/world-loader'

SettingsContainer.INSTANCE = SettingsContainer.createEmpty()
takeControlOverWorkerConnection()

setMessageHandler('set-global-mutex', (data) => {
	setGlobalMutex(data['mutex'])
})

setMessageHandler('new-settings', settings => {
	SettingsContainer.INSTANCE.update(settings)
})

setMessageHandler('terminate-game', () => {
	globalStateUpdater?.terminate()
	setGlobalGameState(null)
	setGlobalStateUpdater(null)
	setGlobalActionsQueue(null)
})

setMessageHandler('create-game', async (args, connection) => {
	let updater
	const stateBroadcastCallback = () => {
		if (globalGameState === null) return
		connection.send('update-entity-container', {
			'buffers': globalGameState?.entities?.passBuffers(),
		})
	}

	const saveName = args['saveName']
	const file = args['fileToRead']
	const queue = ReceiveActionsQueue.create()
	setGlobalActionsQueue(queue)

	const state = file !== undefined
		? await loadGameFromFile(file, queue, stateBroadcastCallback)
		: (saveName !== undefined
			? await loadGameFromDb(saveName, queue, stateBroadcastCallback)
			: createEmptyGame(queue, stateBroadcastCallback))
	setGlobalGameState(state)

	updater = createNewStateUpdater(() => (state as GameStateImplementation).advanceActivities(), state.currentTick)
	setGlobalStateUpdater(updater)

	connection.send('game-snapshot-for-renderer', {
		'game': (state as GameStateImplementation).passForRenderer(),
		'updater': updater.pass(),
	})
})

setMessageHandler('save-game', async (data, connection) => {
	const saveName = data['saveName']
	const state = globalGameState as GameStateImplementation
	if (state === null) return
	switch (data['method']) {
		case SaveMethod.ToIndexedDatabase: {
			setArrayEncodingType(ArrayEncodingType.Array)
			const rawData = state.serialize()
			setArrayEncodingType(ArrayEncodingType.None)
			await putSaveData(saveName, rawData)
		}
			break
		case SaveMethod.ToDataUrl: {
			setArrayEncodingType(ArrayEncodingType.String)
			const asString = JSON.stringify(state.serialize())
			setArrayEncodingType(ArrayEncodingType.None)

			const length = asString.length
			const bytes = new Uint8Array(length)
			for (let i = 0; i < length; i++)
				bytes[i] = asString.charCodeAt(i)!
			const url = URL.createObjectURL(new Blob([bytes]))

			connection.send('save-game-result', {'url': url})
		}
	}
})

setMessageHandler('scheduled-action', (action) => {
	globalActionsQueue?.append(action)
})

import { vi, type MockInstance, describe, it, expect, afterEach } from 'vitest'
import Chance from 'chance'
import { Actions, Allegiances, EmbezzleChallengeResponses, EventMessages, ExamineResponses, GameSettings, Influences, PlayerControllers, Responses } from '../../../shared/types/game'
import {
  actionChallengeResponseHandler,
  actionHandler,
  actionResponseHandler,
  addAiPlayerHandler,
  blockChallengeResponseHandler,
  blockResponseHandler,
  chooseExamineInfluenceHandler,
  createGameHandler,
  embezzleChallengeDecisionHandler,
  joinGameHandler,
  loseInfluencesHandler,
  removeFromGameHandler,
  resolveExamineHandler,
  resetGameHandler,
  resetGameRequestCancelHandler,
  resetGameRequestHandler,
  setGameSettingsHandler,
  setModeratorHandler,
  setPlayerControllerHandler,
  startGameHandler,
} from './actionHandlers'
import { getValue, setValue } from '../utilities/storage'
import { getGameState, getPublicGameState, mutateGameState } from '../utilities/gameState'
import * as identifiers from '../utilities/identifiers'
import {
  ActionNotChallengeableError,
  ActionNotCurrentlyAllowedError,
  ClaimedInfluenceAlreadyConfirmedError,
  ClaimedInfluenceInvalidError,
  ClaimedInfluenceRequiredError,
  ConnectedSpectatorRequiredError,
  DifferentPlayerNameError,
  GameInProgressError,
  GameNotInProgressError,
  InsufficientCoinsError,
  InvalidActionAt10CoinsError,
  MissingInfluenceError,
  OnlyLobbyCreatorCanDemoteModeratorsError,
  OnlyLobbyCreatorOrModeratorCanManageModeratorsError,
  OnlyLobbyCreatorOrModeratorCanSetGameSettingsError,
  OnlyLobbyCreatorCanSetPlayerControllerError,
  OnlyLobbyCreatorCanStartGameError,
  PlayerAlreadyBotControlledError,
  PlayerAlreadyHumanControlledError,
  PlayerNotInGameError,
  RoomIdAlreadyExistsError,
  TargetPlayerIsSelfError,
  TargetPlayerRequiredForActionError,
} from '../utilities/errors'
import { clearRoomPresence, upsertRoomPresence } from '../utilities/roomPresence'

vi.mock('../utilities/storage')

const getValueMock = vi.mocked(getValue)
const setValueMock = vi.mocked(setValue)

const inMemoryStorage: {
  [key: string]: string;
} = {}

getValueMock.mockImplementation(async (key: string) => {
  await new Promise((resolve) => {
    setTimeout(resolve, Math.floor(Math.random() * 10))
  })
  return inMemoryStorage[key]
})

setValueMock.mockImplementation(async (key: string, value: string) => {
  await new Promise((resolve) => {
    setTimeout(resolve, Math.floor(Math.random() * 10))
  })
  inMemoryStorage[key] = value
})

const chance = new Chance()

describe('actionHandlers', () => {
  let generateRoomIdSpy: MockInstance | undefined
  afterEach(() => {
    generateRoomIdSpy?.mockRestore()
    clearRoomPresence()
  })

  describe('game scenarios', () => {
    const [david, marissa, harper, hailey] = [
      'David',
      'Marissa',
      'Harper',
      'Hailey',
    ].map((name) => ({
      playerName: name,
      playerId: chance.string({ length: 10 }),
    }))

    const defaultGameSettings: GameSettings = {
      eventLogRetentionTurns: 100,
      allowRevive: true,
    }

    const setupTestGame = async (
      players: {
        playerId: string;
        playerName: string;
        coins?: number;
        influences?: Influences[];
        deadInfluences?: Influences[];
      }[],
      settings: GameSettings = defaultGameSettings,
    ) => {
      const { roomId } = await createGameHandler({
        ...players[0],
        settings,
      })

      for (const player of players) {
        await joinGameHandler({ roomId, ...player })
      }
      await startGameHandler({
        roomId,
        playerId: players[0].playerId,
      })

      await mutateGameState(await getGameState(roomId), (state) => {
        const influencesUsed: Influences[] = []
        state.players = players.map((player) => {
          const statePlayer = state.players.find(
            ({ name }) => player.playerName === name,
          )!
          if (player.influences) {
            state.deck.push(...statePlayer.influences.splice(0))
            statePlayer.influences.push(...player.influences)
            influencesUsed.push(...player.influences)
          }
          if (player.deadInfluences) {
            statePlayer.deadInfluences.push(...player.deadInfluences)
            influencesUsed.push(...player.deadInfluences)
          }
          return {
            ...statePlayer,
            coins: player.coins ?? statePlayer.coins,
          }
        })
        influencesUsed.forEach((influence: Influences) => {
          state.deck.splice(
            state.deck.findIndex((i) => i === influence),
            1,
          )
        })

        state.turnPlayer = players[0].playerName
      })

      return roomId
    }

    it('creating, joining, resetting game', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: { eventLogRetentionTurns: 100, allowRevive: true },
      })

      await joinGameHandler({ roomId, ...hailey, playerName: 'not hailey' })
      await joinGameHandler({ roomId: roomId.toLowerCase(), ...hailey })

      await startGameHandler({ roomId, playerId: harper.playerId })
      await expect(
        startGameHandler({ roomId, playerId: harper.playerId }),
      ).rejects.toThrow(GameInProgressError)
      await expect(
        removeFromGameHandler({
          roomId,
          playerId: hailey.playerId,
          playerName: david.playerName,
        }),
      ).rejects.toThrow(GameInProgressError)
      await expect(joinGameHandler({ roomId, ...david })).rejects.toThrow(
        GameInProgressError,
      )
      await expect(
        resetGameHandler({ roomId, playerId: hailey.playerId }),
      ).rejects.toThrow(GameInProgressError)
      await expect(
        joinGameHandler({ roomId, ...hailey, playerName: 'new hailey' }),
      ).rejects.toThrow(DifferentPlayerNameError)

      await mutateGameState(await getGameState(roomId), (state) => {
        state.players
          .slice(1)
          .forEach((player) =>
            player.deadInfluences.push(...player.influences.splice(0)),
          )
      })

      await resetGameHandler({ roomId, playerId: hailey.playerId })
      await expect(
        resetGameHandler({ roomId, playerId: hailey.playerId }),
      ).rejects.toThrow(GameNotInProgressError)

      await startGameHandler({ roomId, playerId: harper.playerId })
      await expect(
        resetGameRequestHandler({ roomId, playerId: david.playerId }),
      ).rejects.toThrow(PlayerNotInGameError)
      await resetGameRequestHandler({ roomId, playerId: hailey.playerId })
      await resetGameRequestCancelHandler({
        roomId,
        playerId: harper.playerId,
      })
      await resetGameRequestCancelHandler({
        roomId,
        playerId: hailey.playerId,
      })
      await expect(
        resetGameHandler({ roomId, playerId: harper.playerId }),
      ).rejects.toThrow(GameInProgressError)
      await resetGameRequestHandler({ roomId, playerId: hailey.playerId })
      await expect(
        resetGameHandler({ roomId, playerId: david.playerId }),
      ).rejects.toThrow(PlayerNotInGameError)
      await resetGameHandler({ roomId, playerId: harper.playerId })
      await resetGameRequestHandler({ roomId, playerId: hailey.playerId })

      await joinGameHandler({ roomId, ...marissa })
      await startGameHandler({ roomId, playerId: harper.playerId })

      await mutateGameState(await getGameState(roomId), (state) => {
        const harperPlayer = state.players.find(
          ({ name }) => name === harper.playerName,
        )
        harperPlayer!.deadInfluences.push(
          ...harperPlayer!.influences.splice(0),
        )
        state.turnPlayer = hailey.playerName
      })

      await resetGameRequestHandler({ roomId, playerId: hailey.playerId })
      await expect(
        resetGameHandler({ roomId, playerId: harper.playerId }),
      ).rejects.toThrow(GameInProgressError)
      await resetGameHandler({ roomId, playerId: marissa.playerId })

      await joinGameHandler({ roomId, ...david })
      await removeFromGameHandler({
        roomId,
        playerId: harper.playerId,
        playerName: david.playerName,
      })
      await expect(
        removeFromGameHandler({
          roomId,
          playerId: hailey.playerId,
          playerName: david.playerName,
        }),
      ).rejects.toThrow(PlayerNotInGameError)

      await expect(
        startGameHandler({ roomId, playerId: hailey.playerId }),
      ).rejects.toThrow(OnlyLobbyCreatorCanStartGameError)
      await removeFromGameHandler({
        roomId,
        playerId: harper.playerId,
        playerName: harper.playerName,
      })
      const gameStateAfterCreatorLeaves = await getGameState(roomId)
      const moderatorAfterCreatorLeaves = gameStateAfterCreatorLeaves.players.find(({ id }) =>
        gameStateAfterCreatorLeaves.moderatorViewerIds.includes(id)
      )
      await startGameHandler({ roomId, playerId: moderatorAfterCreatorLeaves!.id })
      await expect(
        startGameHandler({ roomId, playerId: moderatorAfterCreatorLeaves!.id }),
      ).rejects.toThrow(GameInProgressError)
    })

    it('should preserve creator-only start permissions across resets', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: { eventLogRetentionTurns: 100, allowRevive: true },
      })

      await joinGameHandler({ roomId, ...hailey })

      await expect(
        startGameHandler({ roomId, playerId: hailey.playerId }),
      ).rejects.toThrow(OnlyLobbyCreatorCanStartGameError)

      await startGameHandler({ roomId, playerId: harper.playerId })

      await mutateGameState(await getGameState(roomId), (state) => {
        state.players
          .filter(({ id }) => id !== harper.playerId)
          .forEach((player) =>
            player.deadInfluences.push(...player.influences.splice(0)),
          )
        state.turnPlayer = harper.playerName
      })

      await resetGameHandler({ roomId, playerId: hailey.playerId })

      await startGameHandler({ roomId, playerId: harper.playerId })
    })

    it('should restore creator start permissions when creator rejoins', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: { eventLogRetentionTurns: 100, allowRevive: true },
      })

      await joinGameHandler({ roomId, ...hailey })
      await joinGameHandler({ roomId, ...marissa })

      await removeFromGameHandler({
        roomId,
        playerId: harper.playerId,
        playerName: harper.playerName,
      })

      await joinGameHandler({ roomId, ...harper })

      await startGameHandler({ roomId, playerId: harper.playerId })
    })

    it('should allow any player to start legacy rooms with no creator recorded', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: { eventLogRetentionTurns: 100, allowRevive: true },
      })

      await joinGameHandler({ roomId, ...hailey })

      await mutateGameState(await getGameState(roomId), (state) => {
        delete state.creatorPlayerId
        state.moderatorViewerIds = []
      })

      await startGameHandler({ roomId, playerId: hailey.playerId })
    })

    it('should allow lobby settings to be updated before the game starts', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: defaultGameSettings,
      })

      await joinGameHandler({ roomId, ...hailey })
      await joinGameHandler({ roomId, ...marissa })

      await setGameSettingsHandler({
        roomId,
        playerId: harper.playerId,
        settings: {
          ...defaultGameSettings,
          enableInquisitor: true,
          allowContessaBlockExamine: true,
          speedRoundSeconds: 20,
        },
      })

      const gameState = await getGameState(roomId)
      expect(gameState.settings).toEqual({
        ...defaultGameSettings,
        enableReformation: false,
        enableInquisitor: true,
        allowContessaBlockExamine: true,
        speedRoundSeconds: 20,
      })
      expect(gameState.deck).toContain(Influences.Inquisitor)
      expect(gameState.deck).not.toContain(Influences.Ambassador)
    })

    it('should restrict lobby settings edits to the connected creator when present', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: defaultGameSettings,
      })

      await joinGameHandler({ roomId, ...hailey })

      await expect(
        setGameSettingsHandler({
          roomId,
          playerId: hailey.playerId,
          settings: {
            ...defaultGameSettings,
            enableReformation: true,
          },
        }),
      ).rejects.toThrow(OnlyLobbyCreatorOrModeratorCanSetGameSettingsError)

      clearRoomPresence()

      await expect(
        setGameSettingsHandler({
          roomId,
          playerId: hailey.playerId,
          settings: {
            ...defaultGameSettings,
            enableReformation: true,
          },
        }),
      ).resolves.toEqual({ roomId, playerId: hailey.playerId })
    })

    it('should only let ordinary players remove themselves before the game starts', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: defaultGameSettings,
      })

      await joinGameHandler({ roomId, ...hailey })
      await joinGameHandler({ roomId, ...marissa })

      await expect(
        removeFromGameHandler({
          roomId,
          playerId: hailey.playerId,
          playerName: marissa.playerName,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      await removeFromGameHandler({
        roomId,
        playerId: hailey.playerId,
        playerName: hailey.playerName,
      })

      expect((await getGameState(roomId)).players.map(({ name }) => name)).toEqual([
        harper.playerName,
        marissa.playerName,
      ])
    })

    it('should allow moderators to manage the lobby but reserve demotion for the creator', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: defaultGameSettings,
      })

      await joinGameHandler({ roomId, ...hailey })
      await joinGameHandler({ roomId, ...marissa })

      await setModeratorHandler({
        roomId,
        playerId: harper.playerId,
        isModerator: true,
        targetPlayerName: hailey.playerName,
      })

      await expect(
        setGameSettingsHandler({
          roomId,
          playerId: hailey.playerId,
          settings: {
            ...defaultGameSettings,
            enableReformation: true,
          },
        }),
      ).resolves.toEqual({ roomId, playerId: hailey.playerId })

      await expect(
        setModeratorHandler({
          roomId,
          playerId: hailey.playerId,
          isModerator: false,
          targetPlayerName: harper.playerName,
        }),
      ).rejects.toThrow(OnlyLobbyCreatorCanDemoteModeratorsError)

      await removeFromGameHandler({
        playerId: hailey.playerId,
        roomId,
        playerName: harper.playerName,
      })

      await startGameHandler({ roomId, playerId: hailey.playerId })
    })

    it('should auto-promote a connected seated human when no moderator remains in the room', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: defaultGameSettings,
      })

      await joinGameHandler({ roomId, ...hailey })
      await joinGameHandler({ roomId, ...marissa })

      await removeFromGameHandler({
        roomId,
        playerId: harper.playerId,
        playerName: harper.playerName,
      })

      const gameState = await getGameState(roomId)
      expect(
        gameState.players
          .filter(({ id }) => gameState.moderatorViewerIds.includes(id))
          .map(({ name }) => name)
      ).toEqual(expect.arrayContaining([expect.stringMatching(/Hailey|Marissa/)]))
    })

    it('should let the creator demote a spectator moderator', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: defaultGameSettings,
      })

      await joinGameHandler({ roomId, ...hailey })

      await setModeratorHandler({
        roomId,
        playerId: harper.playerId,
        isModerator: true,
        targetPlayerName: hailey.playerName,
      })

      await removeFromGameHandler({
        roomId,
        playerId: hailey.playerId,
        playerName: hailey.playerName,
      })

      const creatorView = getPublicGameState({
        gameState: await getGameState(roomId),
        playerId: harper.playerId,
      })
      const haileySpectator = creatorView.spectators?.find(
        ({ name }) => name === hailey.playerName,
      )

      expect(haileySpectator?.isModerator).toBe(true)

      await setModeratorHandler({
        roomId,
        playerId: harper.playerId,
        isModerator: false,
        targetSpectatorId: haileySpectator!.id,
      })

      const gameState = await getGameState(roomId)
      expect(gameState.moderatorViewerIds).not.toContain(hailey.playerId)
    })

    it('should reject ordinary-player moderator promotion attempts', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: defaultGameSettings,
      })

      await joinGameHandler({ roomId, ...hailey })

      await expect(
        setModeratorHandler({
          roomId,
          playerId: hailey.playerId,
          isModerator: true,
          targetPlayerName: harper.playerName,
        }),
      ).rejects.toThrow(OnlyLobbyCreatorOrModeratorCanManageModeratorsError)

      const gameState = await getGameState(roomId)
      expect(gameState.moderatorViewerIds).toContain(harper.playerId)
    })

    it('should let the creator switch a human player to bot control mid-game', async () => {
      const roomId = await setupTestGame([harper, hailey, marissa])

      await setPlayerControllerHandler({
        roomId,
        playerId: harper.playerId,
        targetPlayerName: hailey.playerName,
        targetController: PlayerControllers.Bot,
      })

      const gameState = await getGameState(roomId)
      const switchedPlayer = gameState.players.find(
        ({ name }) => name === hailey.playerName,
      )!

      expect(switchedPlayer.name).toBe(hailey.playerName)
      expect(switchedPlayer.ai).toBe(true)
      expect(switchedPlayer.id).not.toBe(hailey.playerId)
      expect(switchedPlayer.personality).toBeTruthy()
      expect(switchedPlayer.personalityHidden).toBe(true)
      expect(gameState.eventLogs.at(-1)).toEqual({
        event: EventMessages.PlayerControllerSetToBot,
        primaryPlayer: hailey.playerName,
        turn: gameState.turn,
      })

      await expect(
        actionHandler({
          roomId,
          playerId: hailey.playerId,
          action: Actions.Income,
        }),
      ).rejects.toThrow(PlayerNotInGameError)
    })

    it('should let the creator assign an ai seat to a connected spectator', async () => {
      const { roomId } = await createGameHandler({
        ...harper,
        settings: { eventLogRetentionTurns: 100, allowRevive: true },
      })

      await joinGameHandler({ roomId, ...hailey })
      await addAiPlayerHandler({
        roomId,
        playerId: harper.playerId,
        playerName: david.playerName,
      })
      await startGameHandler({ roomId, playerId: harper.playerId })

      upsertRoomPresence({
        roomId,
        playerId: marissa.playerId,
        name: marissa.playerName,
      })

      const creatorState = getPublicGameState({
        gameState: await getGameState(roomId),
        playerId: harper.playerId,
      })
      const spectatorId = creatorState.spectators?.find(
        ({ name }) => name === marissa.playerName,
      )?.id

      expect(spectatorId).toBeTruthy()

      await setPlayerControllerHandler({
        roomId,
        playerId: harper.playerId,
        targetPlayerName: david.playerName,
        targetController: PlayerControllers.Human,
        spectatorId: spectatorId!,
      })

      const gameState = await getGameState(roomId)
      const assignedSeat = gameState.players.find(
        ({ name }) => name === david.playerName,
      )!

      expect(assignedSeat.name).toBe(david.playerName)
      expect(assignedSeat.ai).toBe(false)
      expect(assignedSeat.id).toBe(marissa.playerId)
      expect(assignedSeat.personality).toBeUndefined()
      expect(assignedSeat.personalityHidden).toBeUndefined()
      expect(gameState.eventLogs.at(-1)).toEqual({
        event: EventMessages.PlayerControllerAssignedToHuman,
        primaryPlayer: david.playerName,
        secondaryPlayer: marissa.playerName,
        turn: gameState.turn,
      })
      expect(
        getPublicGameState({
          gameState,
          playerId: marissa.playerId,
        }).selfPlayer?.name,
      ).toBe(david.playerName)
    })

    it('should allow the creator to keep switching seats while spectating', async () => {
      const roomId = await setupTestGame([harper, hailey, marissa])

      await setPlayerControllerHandler({
        roomId,
        playerId: harper.playerId,
        targetPlayerName: harper.playerName,
        targetController: PlayerControllers.Bot,
      })

      await expect(
        setPlayerControllerHandler({
          roomId,
          playerId: harper.playerId,
          targetPlayerName: marissa.playerName,
          targetController: PlayerControllers.Bot,
        }),
      ).resolves.toEqual({ roomId, playerId: harper.playerId })

      const gameState = await getGameState(roomId)
      expect(
        gameState.players.find(({ name }) => name === marissa.playerName)?.ai,
      ).toBe(true)
    })

    it('should reject invalid controller switch requests', async () => {
      const roomId = await setupTestGame([harper, hailey, marissa])

      await expect(
        setPlayerControllerHandler({
          roomId,
          playerId: hailey.playerId,
          targetPlayerName: marissa.playerName,
          targetController: PlayerControllers.Bot,
        }),
      ).rejects.toThrow(OnlyLobbyCreatorCanSetPlayerControllerError)

      await setPlayerControllerHandler({
        roomId,
        playerId: harper.playerId,
        targetPlayerName: marissa.playerName,
        targetController: PlayerControllers.Bot,
      })

      await expect(
        setPlayerControllerHandler({
          roomId,
          playerId: harper.playerId,
          targetPlayerName: marissa.playerName,
          targetController: PlayerControllers.Bot,
        }),
      ).rejects.toThrow(PlayerAlreadyBotControlledError)

      await expect(
        setPlayerControllerHandler({
          roomId,
          playerId: harper.playerId,
          targetPlayerName: hailey.playerName,
          targetController: PlayerControllers.Human,
        }),
      ).rejects.toThrow(PlayerAlreadyHumanControlledError)

      await expect(
        setPlayerControllerHandler({
          roomId,
          playerId: harper.playerId,
          targetPlayerName: marissa.playerName,
          targetController: PlayerControllers.Human,
        }),
      ).rejects.toThrow(ConnectedSpectatorRequiredError)

      await expect(
        setPlayerControllerHandler({
          roomId,
          playerId: harper.playerId,
          targetPlayerName: marissa.playerName,
          targetController: PlayerControllers.Human,
          spectatorId: chance.guid(),
        }),
      ).rejects.toThrow(ConnectedSpectatorRequiredError)
    })

    it('creating new game can not wipe out existing game when room id conflicts', async () => {
      generateRoomIdSpy = vi
        .spyOn(identifiers, 'generateRoomId')
        .mockReturnValue('DUPLICATE')

      await createGameHandler({
        ...harper,
        settings: { eventLogRetentionTurns: 100, allowRevive: true },
      })

      await expect(
        createGameHandler({
          ...harper,
          settings: { eventLogRetentionTurns: 100, allowRevive: true },
        }),
      ).rejects.toThrow(RoomIdAlreadyExistsError)
    })

    it('everyone passes on action', async () => {
      const roomId = await setupTestGame([david, harper, hailey])

      await expect(
        actionHandler({
          roomId,
          playerId: harper.playerId,
          action: Actions.Tax,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)
      await expect(
        actionHandler({
          roomId,
          playerId: hailey.playerId,
          action: Actions.Tax,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)
      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Tax,
      })
      await expect(
        actionHandler({
          roomId,
          playerId: david.playerId,
          action: Actions.Tax,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      await expect(
        actionResponseHandler({
          roomId,
          playerId: david.playerId,
          response: Responses.Pass,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Pass,
      })
      await expect(
        actionResponseHandler({
          roomId,
          playerId: harper.playerId,
          response: Responses.Pass,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Pass,
      })
      await expect(
        actionResponseHandler({
          roomId,
          playerId: hailey.playerId,
          response: Responses.Pass,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(harper.playerName)
      expect(gameState.players[0].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(5)
    })

    it('tax -> successful challenge -> tax and lost influence', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Ambassador] },
        { ...harper, influences: [Influences.Captain, Influences.Ambassador] },
        { ...hailey, influences: [Influences.Captain, Influences.Ambassador] },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Tax,
      })

      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Challenge,
      })

      await expect(
        actionChallengeResponseHandler({
          roomId,
          playerId: harper.playerId,
          influence: Influences.Contessa,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)
      await expect(
        actionChallengeResponseHandler({
          roomId,
          playerId: hailey.playerId,
          influence: Influences.Assassin,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      await expect(
        actionChallengeResponseHandler({
          roomId,
          playerId: david.playerId,
          influence: Influences.Duke,
        }),
      ).rejects.toThrow(MissingInfluenceError)
      await actionChallengeResponseHandler({
        roomId,
        playerId: david.playerId,
        influence: Influences.Captain,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(harper.playerName)
      expect(gameState.players[0].influences).toHaveLength(1)
      expect(gameState.players[1].influences).toHaveLength(2)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(2)
      expect(gameState.players[1].coins).toBe(2)
      expect(gameState.players[2].coins).toBe(2)
    })

    it('steal -> failed challenge -> block -> failed challenge -> steal and 2 lost influences', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Ambassador] },
        { ...harper, influences: [Influences.Captain, Influences.Ambassador] },
        { ...hailey, influences: [Influences.Captain, Influences.Ambassador] },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.ForeignAid,
      })
      await expect(
        actionResponseHandler({
          roomId,
          playerId: harper.playerId,
          response: Responses.Challenge,
        }),
      ).rejects.toThrow(ActionNotChallengeableError)
      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Pass,
      })
      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Pass,
      })

      await expect(
        actionHandler({
          roomId,
          playerId: harper.playerId,
          action: Actions.Steal,
        }),
      ).rejects.toThrow(TargetPlayerRequiredForActionError)
      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Steal,
        targetPlayer: hailey.playerName,
      })

      await actionResponseHandler({
        roomId,
        playerId: david.playerId,
        response: Responses.Challenge,
      })

      await expect(
        actionChallengeResponseHandler({
          roomId,
          playerId: david.playerId,
          influence: Influences.Contessa,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)
      await expect(
        actionChallengeResponseHandler({
          roomId,
          playerId: hailey.playerId,
          influence: Influences.Assassin,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      await actionChallengeResponseHandler({
        roomId,
        playerId: harper.playerId,
        influence: Influences.Captain,
      })

      await expect(
        loseInfluencesHandler({
          roomId,
          playerId: david.playerId,
          influences: [Influences.Assassin],
        }),
      ).rejects.toThrow(MissingInfluenceError)
      await loseInfluencesHandler({
        roomId,
        playerId: david.playerId,
        influences: [Influences.Ambassador],
      })

      await expect(
        actionResponseHandler({
          roomId,
          playerId: hailey.playerId,
          response: Responses.Challenge,
        }),
      ).rejects.toThrow(ClaimedInfluenceAlreadyConfirmedError)
      await expect(
        actionResponseHandler({
          roomId,
          playerId: hailey.playerId,
          response: Responses.Block,
        }),
      ).rejects.toThrow(ClaimedInfluenceRequiredError)
      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Block,
        claimedInfluence: Influences.Ambassador,
      })

      await blockResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Pass,
      })
      await blockResponseHandler({
        roomId,
        playerId: david.playerId,
        response: Responses.Challenge,
      })

      await blockChallengeResponseHandler({
        roomId,
        playerId: hailey.playerId,
        influence: Influences.Ambassador,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(hailey.playerName)
      expect(gameState.players[0].influences).toHaveLength(0)
      expect(gameState.players[1].influences).toHaveLength(2)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(4)
      expect(gameState.players[1].coins).toBe(2)
      expect(gameState.players[2].coins).toBe(2)
    })

    it('rejects same-allegiance Foreign Aid blocks in reformation but allows opposing-allegiance blocks', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Ambassador] },
        { ...harper, influences: [Influences.Duke, Influences.Ambassador] },
        { ...hailey, influences: [Influences.Duke, Influences.Captain] },
      ], {
        ...defaultGameSettings,
        enableReformation: true,
      })

      await mutateGameState(await getGameState(roomId), (state) => {
        delete state.pendingStartingAllegiance
        state.players.find(({ name }) => name === david.playerName)!.allegiance = Allegiances.Loyalist
        state.players.find(({ name }) => name === harper.playerName)!.allegiance = Allegiances.Loyalist
        state.players.find(({ name }) => name === hailey.playerName)!.allegiance = Allegiances.Reformist
      })

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.ForeignAid,
      })

      await expect(
        actionResponseHandler({
          roomId,
          playerId: harper.playerId,
          response: Responses.Block,
          claimedInfluence: Influences.Duke,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Block,
        claimedInfluence: Influences.Duke,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.pendingBlock?.sourcePlayer).toBe(hailey.playerName)
      expect(gameState.pendingAction?.action).toBe(Actions.ForeignAid)
    })

    it('steal -> block -> failed challenge -> no steal and lost influence', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Ambassador] },
        { ...harper, influences: [Influences.Captain, Influences.Ambassador] },
        { ...hailey, influences: [Influences.Captain, Influences.Ambassador] },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Income,
      })

      await actionHandler({
        roomId,
        playerId: hailey.playerId,
        action: Actions.Steal,
        targetPlayer: david.playerName,
      })

      await actionResponseHandler({
        roomId,
        playerId: david.playerId,
        response: Responses.Block,
        claimedInfluence: Influences.Captain,
      })

      await blockResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Challenge,
      })

      await expect(
        blockChallengeResponseHandler({
          roomId,
          playerId: david.playerId,
          influence: Influences.Contessa,
        }),
      ).rejects.toThrow(MissingInfluenceError)
      await expect(
        blockChallengeResponseHandler({
          roomId,
          playerId: harper.playerId,
          influence: Influences.Contessa,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)
      await expect(
        blockChallengeResponseHandler({
          roomId,
          playerId: hailey.playerId,
          influence: Influences.Assassin,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)
      await blockChallengeResponseHandler({
        roomId,
        playerId: david.playerId,
        influence: Influences.Captain,
      })

      await loseInfluencesHandler({
        roomId,
        playerId: hailey.playerId,
        influences: [Influences.Ambassador],
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(david.playerName)
      expect(gameState.players[0].influences).toHaveLength(2)
      expect(gameState.players[1].influences).toHaveLength(2)
      expect(gameState.players[2].influences).toHaveLength(1)
      expect(gameState.players[0].coins).toBe(3)
      expect(gameState.players[1].coins).toBe(3)
      expect(gameState.players[2].coins).toBe(2)
    })

    it('assassinate -> block -> pass -> coins spent and no influences lost', async () => {
      const roomId = await setupTestGame([
        david,
        harper,
        { ...hailey, coins: 3 },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Income,
      })

      await actionHandler({
        roomId,
        playerId: hailey.playerId,
        action: Actions.Assassinate,
        targetPlayer: david.playerName,
      })

      await expect(
        actionResponseHandler({
          roomId,
          playerId: david.playerId,
          response: Responses.Block,
          claimedInfluence: Influences.Captain,
        }),
      ).rejects.toThrow(ClaimedInfluenceInvalidError)
      await actionResponseHandler({
        roomId,
        playerId: david.playerId,
        response: Responses.Block,
        claimedInfluence: Influences.Contessa,
      })

      await blockResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Pass,
      })
      await blockResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Pass,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(david.playerName)
      expect(gameState.players[0].influences).toHaveLength(2)
      expect(gameState.players[1].influences).toHaveLength(2)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(3)
      expect(gameState.players[1].coins).toBe(3)
      expect(gameState.players[2].coins).toBe(0)
    })

    it('exchange -> pass -> influences replaced', async () => {
      const roomId = await setupTestGame([david, harper, hailey])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Exchange,
      })

      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Pass,
      })
      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Pass,
      })

      let gameState = await getGameState(roomId)

      await loseInfluencesHandler({
        roomId,
        playerId: david.playerId,
        influences: chance.pickset(gameState.players[0].influences, 2),
      })

      gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(harper.playerName)
      expect(gameState.players[0].influences).toHaveLength(2)
      expect(gameState.players[1].influences).toHaveLength(2)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(2)
      expect(gameState.players[1].coins).toBe(2)
      expect(gameState.players[2].coins).toBe(2)
    })

    it('examine -> return logs the outcome without revealing the card', async () => {
      const roomId = await setupTestGame([
        { ...harper, influences: [Influences.Inquisitor, Influences.Duke] },
        { ...hailey, influences: [Influences.Captain, Influences.Contessa] },
        david,
      ], {
        ...defaultGameSettings,
        enableInquisitor: true,
      })

      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Examine,
        targetPlayer: hailey.playerName,
      })
      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Pass,
      })
      await actionResponseHandler({
        roomId,
        playerId: david.playerId,
        response: Responses.Pass,
      })
      await chooseExamineInfluenceHandler({
        roomId,
        playerId: hailey.playerId,
        influence: Influences.Captain,
      })
      await resolveExamineHandler({
        roomId,
        playerId: harper.playerId,
        response: ExamineResponses.Return,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.eventLogs.slice(-2)).toEqual([
        expect.objectContaining({
          event: EventMessages.ActionProcessed,
          action: Actions.Examine,
          primaryPlayer: harper.playerName,
          secondaryPlayer: hailey.playerName,
        }),
        expect.objectContaining({
          event: EventMessages.ExamineReturned,
          primaryPlayer: harper.playerName,
          secondaryPlayer: hailey.playerName,
        }),
      ])
      expect(gameState.eventLogs.at(-1)?.influence).toBeUndefined()
    })

    it('examine -> force exchange logs the outcome without revealing the card', async () => {
      const roomId = await setupTestGame([
        { ...harper, influences: [Influences.Inquisitor, Influences.Duke] },
        { ...hailey, influences: [Influences.Captain, Influences.Contessa] },
        david,
      ], {
        ...defaultGameSettings,
        enableInquisitor: true,
      })

      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Examine,
        targetPlayer: hailey.playerName,
      })
      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Pass,
      })
      await actionResponseHandler({
        roomId,
        playerId: david.playerId,
        response: Responses.Pass,
      })
      await chooseExamineInfluenceHandler({
        roomId,
        playerId: hailey.playerId,
        influence: Influences.Captain,
      })
      await resolveExamineHandler({
        roomId,
        playerId: harper.playerId,
        response: ExamineResponses.ForceExchange,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.eventLogs.slice(-2)).toEqual([
        expect.objectContaining({
          event: EventMessages.ActionProcessed,
          action: Actions.Examine,
          primaryPlayer: harper.playerName,
          secondaryPlayer: hailey.playerName,
        }),
        expect.objectContaining({
          event: EventMessages.ExamineForcedExchange,
          primaryPlayer: harper.playerName,
          secondaryPlayer: hailey.playerName,
        }),
      ])
      expect(gameState.eventLogs.at(-1)?.influence).toBeUndefined()
    })

    it('convert logs who changed allegiance from what to what', async () => {
      const roomId = await setupTestGame([
        { ...david, coins: 2 },
        harper,
        hailey,
      ], {
        ...defaultGameSettings,
        enableReformation: true,
      })

      await mutateGameState(await getGameState(roomId), (state) => {
        state.players.find(({ name }) => name === david.playerName)!.allegiance = Allegiances.Loyalist
        state.players.find(({ name }) => name === harper.playerName)!.allegiance = Allegiances.Reformist
        state.players.find(({ name }) => name === hailey.playerName)!.allegiance = Allegiances.Reformist
        delete state.pendingStartingAllegiance
      })

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Convert,
        targetPlayer: harper.playerName,
      })

      expect((await getGameState(roomId)).eventLogs.at(-1)).toEqual(expect.objectContaining({
        event: EventMessages.ActionProcessed,
        action: Actions.Convert,
        primaryPlayer: david.playerName,
        secondaryPlayer: harper.playerName,
        fromAllegiance: Allegiances.Reformist,
        toAllegiance: Allegiances.Loyalist,
      }))
    })

    it('self-convert logs the acting player allegiance transition', async () => {
      const roomId = await setupTestGame([
        { ...david, coins: 1 },
        harper,
        hailey,
      ], {
        ...defaultGameSettings,
        enableReformation: true,
      })

      await mutateGameState(await getGameState(roomId), (state) => {
        state.players.find(({ name }) => name === david.playerName)!.allegiance = Allegiances.Loyalist
        state.players.find(({ name }) => name === harper.playerName)!.allegiance = Allegiances.Reformist
        state.players.find(({ name }) => name === hailey.playerName)!.allegiance = Allegiances.Reformist
        delete state.pendingStartingAllegiance
      })

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Convert,
        targetPlayer: david.playerName,
      })

      expect((await getGameState(roomId)).eventLogs.at(-1)).toEqual(expect.objectContaining({
        event: EventMessages.ActionProcessed,
        action: Actions.Convert,
        primaryPlayer: david.playerName,
        fromAllegiance: Allegiances.Loyalist,
        toAllegiance: Allegiances.Reformist,
      }))
      expect((await getGameState(roomId)).eventLogs.at(-1)?.secondaryPlayer).toBeUndefined()
    })

    it('coup', async () => {
      const roomId = await setupTestGame([
        david,
        harper,
        { ...hailey, coins: 7 },
      ])

      await expect(
        actionHandler({
          roomId,
          playerId: david.playerId,
          action: Actions.Coup,
          targetPlayer: hailey.playerName,
        }),
      ).rejects.toThrow(InsufficientCoinsError)
      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Income,
      })
      await expect(
        actionHandler({
          roomId,
          playerId: harper.playerId,
          action: Actions.Coup,
          targetPlayer: hailey.playerName,
        }),
      ).rejects.toThrow(InsufficientCoinsError)
      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Income,
      })

      await expect(
        actionHandler({
          roomId,
          playerId: hailey.playerId,
          action: Actions.Coup,
          targetPlayer: hailey.playerName,
        }),
      ).rejects.toThrow(TargetPlayerIsSelfError)
      await actionHandler({
        roomId,
        playerId: hailey.playerId,
        action: Actions.Coup,
        targetPlayer: david.playerName,
      })
      await expect(
        actionHandler({
          roomId,
          playerId: hailey.playerId,
          action: Actions.Income,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      let gameState = await getGameState(roomId)

      await loseInfluencesHandler({
        roomId,
        playerId: david.playerId,
        influences: [chance.pickone(gameState.players[0].influences)],
      })

      gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(david.playerName)
      expect(gameState.players[0].influences).toHaveLength(1)
      expect(gameState.players[1].influences).toHaveLength(2)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(3)
      expect(gameState.players[1].coins).toBe(3)
      expect(gameState.players[2].coins).toBe(0)
    })

    it('revive', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Duke, Influences.Contessa] },
        { ...harper, influences: [Influences.Captain, Influences.Ambassador] },
        {
          ...hailey,
          coins: 10,
          influences: [Influences.Assassin],
          deadInfluences: [Influences.Captain],
        },
      ])

      await expect(
        actionHandler({
          roomId,
          playerId: david.playerId,
          action: Actions.Revive,
        }),
      ).rejects.toThrow(InsufficientCoinsError)
      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Income,
      })
      await expect(
        actionHandler({
          roomId,
          playerId: harper.playerId,
          action: Actions.Revive,
        }),
      ).rejects.toThrow(InsufficientCoinsError)
      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Income,
      })

      await expect(
        actionHandler({
          roomId,
          playerId: hailey.playerId,
          action: Actions.Income,
        }),
      ).rejects.toThrow(InvalidActionAt10CoinsError)
      await actionHandler({
        roomId,
        playerId: hailey.playerId,
        action: Actions.Revive,
      })
      await expect(
        actionHandler({
          roomId,
          playerId: hailey.playerId,
          action: Actions.Income,
        }),
      ).rejects.toThrow(ActionNotCurrentlyAllowedError)

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(david.playerName)
      expect(gameState.players[0].influences).toHaveLength(2)
      expect(gameState.players[1].influences).toHaveLength(2)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(3)
      expect(gameState.players[1].coins).toBe(3)
      expect(gameState.players[2].coins).toBe(0)
    })

    it('assassination -> failed challenge -> last influence killed', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Ambassador] },
        {
          ...harper,
          influences: [Influences.Captain],
          deadInfluences: [Influences.Ambassador],
        },
        {
          ...hailey,
          influences: [Influences.Captain, Influences.Assassin],
          coins: 3,
        },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: hailey.playerId,
        action: Actions.Assassinate,
        targetPlayer: harper.playerName,
      })

      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Challenge,
      })

      await actionChallengeResponseHandler({
        roomId,
        playerId: hailey.playerId,
        influence: Influences.Assassin,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(david.playerName)
      expect(gameState.players[0].influences).toHaveLength(2)
      expect(gameState.players[1].influences).toHaveLength(0)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(3)
      expect(gameState.players[1].coins).toBe(3)
      expect(gameState.players[2].coins).toBe(0)
    })

    it('assassination -> failed challenge -> both influences killed', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Ambassador] },
        { ...harper, influences: [Influences.Captain, Influences.Ambassador] },
        {
          ...hailey,
          influences: [Influences.Captain, Influences.Assassin],
          coins: 3,
        },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: hailey.playerId,
        action: Actions.Assassinate,
        targetPlayer: harper.playerName,
      })

      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Challenge,
      })

      await actionChallengeResponseHandler({
        roomId,
        playerId: hailey.playerId,
        influence: Influences.Assassin,
      })

      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Block,
        claimedInfluence: Influences.Contessa,
      })

      await blockResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Challenge,
      })

      await blockChallengeResponseHandler({
        roomId,
        playerId: harper.playerId,
        influence: Influences.Ambassador,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(david.playerName)
      expect(gameState.players[0].influences).toHaveLength(2)
      expect(gameState.players[1].influences).toHaveLength(0)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(3)
      expect(gameState.players[1].coins).toBe(3)
      expect(gameState.players[2].coins).toBe(0)
    })

    it('assassination -> block -> successful challenge -> both influences killed', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Ambassador] },
        { ...harper, influences: [Influences.Captain, Influences.Ambassador] },
        {
          ...hailey,
          influences: [Influences.Captain, Influences.Assassin],
          coins: 3,
        },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: hailey.playerId,
        action: Actions.Assassinate,
        targetPlayer: david.playerName,
      })

      await actionResponseHandler({
        roomId,
        playerId: david.playerId,
        response: Responses.Block,
        claimedInfluence: Influences.Contessa,
      })

      await blockResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Challenge,
      })

      await blockChallengeResponseHandler({
        roomId,
        playerId: david.playerId,
        influence: Influences.Captain,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(harper.playerName)
      expect(gameState.players[0].influences).toHaveLength(0)
      expect(gameState.players[1].influences).toHaveLength(2)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(3)
      expect(gameState.players[1].coins).toBe(3)
      expect(gameState.players[2].coins).toBe(0)
    })

    it('assassination -> failed challenge -> successful block', async () => {
      const roomId = await setupTestGame([
        {
          ...david,
          influences: [Influences.Captain],
          deadInfluences: [Influences.Ambassador],
        },
        {
          ...harper,
          influences: [Influences.Ambassador],
          deadInfluences: [Influences.Captain],
        },
        {
          ...hailey,
          influences: [Influences.Captain, Influences.Assassin],
          coins: 3,
        },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: harper.playerId,
        action: Actions.Income,
      })
      await actionHandler({
        roomId,
        playerId: hailey.playerId,
        action: Actions.Assassinate,
        targetPlayer: david.playerName,
      })

      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Challenge,
      })

      await actionChallengeResponseHandler({
        roomId,
        playerId: hailey.playerId,
        influence: Influences.Assassin,
      })

      await expect(
        actionResponseHandler({
          roomId,
          playerId: david.playerId,
          response: Responses.Block,
          claimedInfluence: Influences.Ambassador,
        }),
      ).rejects.toThrow(ClaimedInfluenceInvalidError)
      await actionResponseHandler({
        roomId,
        playerId: david.playerId,
        response: Responses.Block,
        claimedInfluence: Influences.Contessa,
      })

      await blockResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Pass,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(david.playerName)
      expect(gameState.players[0].influences).toHaveLength(1)
      expect(gameState.players[1].influences).toHaveLength(0)
      expect(gameState.players[2].influences).toHaveLength(2)
      expect(gameState.players[0].coins).toBe(3)
      expect(gameState.players[1].coins).toBe(3)
      expect(gameState.players[2].coins).toBe(0)
    })

    it('tax -> failed challenge -> tax and lost influence', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Duke] },
        { ...harper, influences: [Influences.Captain, Influences.Ambassador] },
        { ...hailey, influences: [Influences.Captain, Influences.Ambassador] },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Tax,
      })

      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Challenge,
      })

      await actionChallengeResponseHandler({
        roomId,
        playerId: david.playerId,
        influence: Influences.Duke,
      })

      await loseInfluencesHandler({
        roomId,
        playerId: hailey.playerId,
        influences: [Influences.Ambassador],
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(harper.playerName)
      expect(gameState.players[0].influences).toHaveLength(2)
      expect(gameState.players[1].influences).toHaveLength(2)
      expect(gameState.players[2].influences).toHaveLength(1)
      expect(gameState.players[0].coins).toBe(5)
      expect(gameState.players[1].coins).toBe(2)
      expect(gameState.players[2].coins).toBe(2)
    })

    it('embezzle -> failed challenge logs live influence replacement without revealing cards', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Assassin, Influences.Captain] },
        { ...harper, influences: [Influences.Duke, Influences.Ambassador] },
        { ...hailey, influences: [Influences.Contessa], deadInfluences: [Influences.Captain] },
      ])

      await mutateGameState(await getGameState(roomId), (state) => {
        state.treasuryReserveCoins = 5
      })

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Embezzle,
      })

      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Challenge,
      })

      await embezzleChallengeDecisionHandler({
        roomId,
        playerId: david.playerId,
        response: EmbezzleChallengeResponses.ProveNoDuke,
      })

      const gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(harper.playerName)
      expect(gameState.turn).toBe(2)
      expect(gameState.treasuryReserveCoins).toBe(0)
      expect(gameState.players[0].coins).toBe(7)
      expect(gameState.eventLogs.slice(-6)).toEqual([
        {
          event: EventMessages.ChallengePending,
          primaryPlayer: hailey.playerName,
          secondaryPlayer: david.playerName,
          turn: 1,
        },
        {
          event: EventMessages.ChallengeFailed,
          primaryPlayer: hailey.playerName,
          secondaryPlayer: david.playerName,
          turn: 1,
        },
        {
          event: EventMessages.PlayerLostInfluence,
          primaryPlayer: hailey.playerName,
          influence: Influences.Contessa,
          turn: 1,
        },
        {
          event: EventMessages.PlayerDied,
          primaryPlayer: hailey.playerName,
          turn: 1,
        },
        {
          event: EventMessages.PlayerReplacedLiveInfluences,
          primaryPlayer: david.playerName,
          turn: 1,
        },
        {
          event: EventMessages.ActionProcessed,
          action: Actions.Embezzle,
          primaryPlayer: david.playerName,
          turn: 1,
        },
      ])
      expect(gameState.eventLogs.at(-2)?.influence).toBeUndefined()
    })

    it('multiple coups sent to server in rapid succession', async () => {
      const roomId = await setupTestGame([
        { ...david, coins: 11 },
        harper,
        hailey,
      ])

      const results = await Promise.allSettled(
        Array.from({ length: 100 }, () =>
          actionHandler({
            roomId,
            playerId: david.playerId,
            action: Actions.Coup,
            targetPlayer: harper.playerName,
          }),
        ),
      )

      expect(results.some(({ status }) => status === 'rejected')).toBe(true)

      const gameState = await getGameState(roomId)

      expect(gameState.players[0].coins).toBe(4)
    })

    it('steal -> failed challenge -> lost influence before new action response', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Ambassador] },
        { ...harper, influences: [Influences.Captain, Influences.Ambassador] },
        { ...hailey, influences: [Influences.Captain, Influences.Assassin] },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Steal,
        targetPlayer: harper.playerName,
      })

      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Challenge,
      })

      await actionChallengeResponseHandler({
        roomId,
        playerId: david.playerId,
        influence: Influences.Captain,
      })

      await loseInfluencesHandler({
        roomId,
        playerId: hailey.playerId,
        influences: [Influences.Assassin],
      })

      let gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(david.playerName)

      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Pass,
      })

      gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(harper.playerName)
    })

    it('steal -> failed challenge -> lost influence after new action response', async () => {
      const roomId = await setupTestGame([
        { ...david, influences: [Influences.Captain, Influences.Ambassador] },
        { ...harper, influences: [Influences.Captain, Influences.Ambassador] },
        { ...hailey, influences: [Influences.Captain, Influences.Assassin] },
      ])

      await actionHandler({
        roomId,
        playerId: david.playerId,
        action: Actions.Steal,
        targetPlayer: harper.playerName,
      })

      await actionResponseHandler({
        roomId,
        playerId: hailey.playerId,
        response: Responses.Challenge,
      })

      await actionChallengeResponseHandler({
        roomId,
        playerId: david.playerId,
        influence: Influences.Captain,
      })

      await actionResponseHandler({
        roomId,
        playerId: harper.playerId,
        response: Responses.Pass,
      })

      let gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(david.playerName)

      await loseInfluencesHandler({
        roomId,
        playerId: hailey.playerId,
        influences: [Influences.Assassin],
      })

      gameState = await getGameState(roomId)

      expect(gameState.turnPlayer).toBe(harper.playerName)
    })
  })
})

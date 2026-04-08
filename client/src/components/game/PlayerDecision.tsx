import { Box } from '@mui/material'
import { canPlayerChooseAction, canPlayerChooseActionChallengeResponse, canPlayerChooseActionResponse, canPlayerChooseBlockChallengeResponse, canPlayerChooseBlockResponse, canPlayerChooseEmbezzleChallengeDecision, canPlayerChooseExamineInfluence, canPlayerChooseStartingAllegiance, canPlayerResolveExamine } from '@shared'
import ChooseAction from "./ChooseAction"
import ChooseActionResponse from "./ChooseActionResponse"
import ChooseChallengeResponse from "./ChooseChallengeResponse"
import ChooseInfluenceToLose from "./ChooseInfluenceToLose"
import ChooseBlockResponse from "./ChooseBlockResponse"
import { useGameStateContext } from "../../contexts/GameStateContext"
import ChooseInfluencesToKeep from "./ChooseInfluencesToKeep"
import WaitingOnOtherPlayers from "./WaitingOnOtherPlayers"
import SpeedRoundTimer from './SpeedRoundTimer'
import ChooseStartingAllegiance from './ChooseStartingAllegiance'
import ChooseExamineInfluence from './ChooseExamineInfluence'
import ResolveExamine from './ResolveExamine'
import ChooseEmbezzleChallengeDecision from './ChooseEmbezzleChallengeDecision'

function PlayerDecision() {
  const { gameState } = useGameStateContext()

  if (!gameState) {
    return null
  }

  if (!gameState.selfPlayer || !gameState.selfPlayer.influences.length) {
    return <WaitingOnOtherPlayers />
  }

  let decision: React.ReactNode = null

  const pendingInfluenceLoss = gameState.pendingInfluenceLoss[gameState.selfPlayer.name]
  if (pendingInfluenceLoss) {
    decision = pendingInfluenceLoss[0].putBackInDeck ? <ChooseInfluencesToKeep /> : <ChooseInfluenceToLose />
  } else if (canPlayerChooseStartingAllegiance(gameState)) {
    decision = <ChooseStartingAllegiance />
  } else if (canPlayerChooseExamineInfluence(gameState)) {
    decision = <ChooseExamineInfluence />
  } else if (canPlayerResolveExamine(gameState)) {
    decision = <ResolveExamine />
  } else if (canPlayerChooseEmbezzleChallengeDecision(gameState)) {
    decision = <ChooseEmbezzleChallengeDecision />
  } else if (canPlayerChooseAction(gameState)) {
    decision = <ChooseAction />
  } else if (canPlayerChooseActionResponse(gameState)) {
    decision = <ChooseActionResponse />
  } else if (canPlayerChooseActionChallengeResponse(gameState)) {
    decision = <ChooseChallengeResponse />
  } else if (gameState.pendingBlock && canPlayerChooseBlockResponse(gameState)) {
    decision = <ChooseBlockResponse />
  } else if (canPlayerChooseBlockChallengeResponse(gameState)) {
    decision = <ChooseChallengeResponse />
  }

  if (decision) {
    return (
      <>
        {decision}
        <Box mt={3}>
          <SpeedRoundTimer />
        </Box>
      </>
    )
  }

  return (
    <WaitingOnOtherPlayers />
  )
}

export default PlayerDecision

import { MAX_PLAYER_COUNT } from "./playerCount"
import { GameSettings, Influences } from "../types/game"

export const getCountOfEachInfluence = (playerCount: number): number => {
  if (playerCount >= 0 && playerCount <= 6) {
    return 3
  }

  if (playerCount >= 7 && playerCount <= 8) {
    return 4
  }

  if (playerCount >= 9 && playerCount <= MAX_PLAYER_COUNT) {
    return 5
  }

  throw new Error(`Invalid player count: ${playerCount}`)
}

export const getDeckInfluences = (
  settings?: Pick<GameSettings, 'enableInquisitor'>
): Influences[] => Object.values(Influences).filter((influence) => {
  if (settings?.enableInquisitor) {
    return influence !== Influences.Ambassador
  }

  return influence !== Influences.Inquisitor
})

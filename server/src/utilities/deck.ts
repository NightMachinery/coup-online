import { getCountOfEachInfluence, getDeckInfluences } from "../../../shared/helpers/deck"
import { GameSettings, Influences } from "../../../shared/types/game"
import { shuffle } from "./array"
export { getCountOfEachInfluence } from "../../../shared/helpers/deck"

export const createDeckForPlayerCount = (playerCount: number, settings?: Pick<GameSettings, 'enableInquisitor'>): Influences[] => {
  const count = getCountOfEachInfluence(playerCount)
  return shuffle(getDeckInfluences(settings).flatMap((influence) => Array.from({ length: count }, () => influence)))
}

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PublicGameState } from '@shared'
import { MaterialThemeContextProvider } from '../../contexts/MaterialThemeContext'
import { GameStateContext } from '../../contexts/GameStateContext'
import RulesDrawerContent from './RulesDrawerContent'
import { getRandomGameState } from '../../../tests/utilities/render'

vi.mock('../../contexts/TranslationsContext', () => ({
  useTranslationContext: () => ({ t: (key: string) => key }),
}))

const renderRules = (gameState?: PublicGameState) => render(
  <MaterialThemeContextProvider>
    <GameStateContext.Provider value={{
      gameState,
      setDehydratedGameState: () => { },
      hasInitialStateLoaded: true,
    }}
    >
      <RulesDrawerContent />
    </GameStateContext.Provider>
  </MaterialThemeContextProvider>
)

const getGameStateWithSettings = (settings: PublicGameState['settings']): PublicGameState => ({
  ...getRandomGameState(),
  settings,
})

describe('RulesDrawerContent', () => {
  it('shows merged all-in-one rules when there is no active room', () => {
    renderRules(undefined)

    expect(screen.getAllByText('Convert').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Embezzle').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inquisitor').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ambassador').length).toBeGreaterThan(0)
    expect(screen.getAllByText((content) => content.includes('optional')).length).toBeGreaterThan(0)
  })

  it('shows standard coup rules for rooms without optional variants enabled', () => {
    renderRules(getGameStateWithSettings({
      allowRevive: false,
      eventLogRetentionTurns: 3,
      enableReformation: false,
      enableInquisitor: false,
      allowContessaBlockExamine: false,
    }))

    expect(screen.queryByText('Convert')).not.toBeInTheDocument()
    expect(screen.queryByText('Embezzle')).not.toBeInTheDocument()
    expect(screen.queryByText('Inquisitor')).not.toBeInTheDocument()
    expect(screen.getAllByText('Ambassador').length).toBeGreaterThan(0)
    expect(screen.queryByText('rulesReformationRestrictions')).not.toBeInTheDocument()
  })

  it('shows reformation and inquisitor rules only when enabled for the room', () => {
    renderRules(getGameStateWithSettings({
      allowRevive: true,
      eventLogRetentionTurns: 3,
      enableReformation: true,
      enableInquisitor: true,
      allowContessaBlockExamine: true,
    }))

    expect(screen.getAllByText('Convert').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Embezzle').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inquisitor').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ambassador')).not.toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('rulesReformationRestrictions'))).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('rulesExamineAllegianceRestriction'))).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('rulesContessaBlockExamine'))).toBeInTheDocument()
  })
})

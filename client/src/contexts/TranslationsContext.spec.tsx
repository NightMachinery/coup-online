import { useEffect } from "react"
import { describe, it, expect } from 'vitest'
import { grey } from "@mui/material/colors"
import { Actions, Allegiances, EventMessages, PublicGameState, AvailableLanguageCode } from "@shared"
import { TranslationContextProvider, useTranslationContext } from "./TranslationsContext"
import { render } from '../../tests/utilities/render'

const TestTranslationComponent = ({ language }: { language: AvailableLanguageCode }) => {
  const { t, setLanguage } = useTranslationContext()

  useEffect(() => {
    setLanguage(language)
  }, [])

  return (
    <p data-testid={`${EventMessages.ActionProcessed}-${Actions.Coup}`}>
      {t(EventMessages.ActionProcessed, {
        action: Actions.Coup,
        gameState: ({
          players: [
            { color: 'blue', name: 'David' },
            { color: 'red', name: 'Bob' }
          ]
        }) as unknown as PublicGameState,
        primaryPlayer: 'David',
        secondaryPlayer: 'Bob'
      })}
      {t('close')}
    </p>
  )
}

const TestConvertTranslationComponent = ({ language }: { language: AvailableLanguageCode }) => {
  const { t, setLanguage } = useTranslationContext()

  useEffect(() => {
    setLanguage(language)
  }, [])

  return (
    <p data-testid={`${EventMessages.ActionProcessed}-${Actions.Convert}`}>
      {t(EventMessages.ActionProcessed, {
        action: Actions.Convert,
        gameState: ({
          players: [
            { color: 'blue', name: 'David' },
            { color: 'red', name: 'Bob' }
          ]
        }) as unknown as PublicGameState,
        primaryPlayer: 'David',
        secondaryPlayer: 'Bob',
        fromAllegiance: Allegiances.Loyalist,
        toAllegiance: Allegiances.Reformist,
      })}
    </p>
  )
}

describe('TranslationContextProvider', () => {
  it('should translate action with template parameters', async () => {
    const { getByTestId, getByText } = render(
      <TranslationContextProvider>
        <TestTranslationComponent language={AvailableLanguageCode["pt-BR"]} />
      </TranslationContextProvider>
    )

    expect(getByTestId(`${EventMessages.ActionProcessed}-${Actions.Coup}`))
      .toHaveTextContent('David Golpeou Bob')
    expect(getByText('David')).toHaveStyle({ color: 'rgb(0, 0, 255)' })
    expect(getByText('Golpeou')).toHaveStyle({ color: grey['400'] })
    expect(getByText('Bob')).toHaveStyle({ color: 'rgb(255, 0, 0)' })
  })

  it('should translate plain text', async () => {
    const { getByText } = render(
      <TranslationContextProvider>
        <TestTranslationComponent language={AvailableLanguageCode["pt-BR"]} />
      </TranslationContextProvider>
    )

    getByText('Fechar')
  })

  it('should translate convert history with allegiance transitions', async () => {
    const { getByTestId } = render(
      <TranslationContextProvider>
        <TestConvertTranslationComponent language={AvailableLanguageCode["en-US"]} />
      </TranslationContextProvider>
    )

    expect(getByTestId(`${EventMessages.ActionProcessed}-${Actions.Convert}`))
      .toHaveTextContent('David converted Bob from Loyalist to Reformist')
  })
})

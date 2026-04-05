import { type ReactNode, useMemo } from "react"
import { Box, DialogContent, DialogContentText, Divider, Typography, useTheme } from "@mui/material"
import { Group } from "@mui/icons-material"
import { Actions, Influences, MAX_PLAYER_COUNT } from '@shared'
import InfluenceIcon from "../icons/InfluenceIcon"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import { useGameStateContext } from "../../contexts/GameStateContext"
import { getRulesVariant } from "./rulesVariant"
import './Rules.css'

type CheatSheetRow = {
  action?: Actions
  actor: 'any' | Influences
  details: ReactNode[]
  influence?: Influences
}

export default function RulesDrawerContent() {
  const { breakpoints, actionColors, influenceColors } = useTheme()
  const { t } = useTranslationContext()
  const { gameState } = useGameStateContext()
  const variant = getRulesVariant(gameState?.settings)

  const renderInfluenceText = (influence: Influences) => (
    <Typography component="span" fontSize="large" fontWeight='bold' color={influence}>
      {t(influence)}
    </Typography>
  )

  const renderActionText = (action: Actions) => (
    <Typography component="span" fontSize="large" fontWeight='bold' color={actionColors[action]}>
      {t(action)}
    </Typography>
  )

  const optionalNote = (settingKey: 'allowRevive' | 'allowContessaBlockExamine' | 'enableInquisitor' | 'enableReformation') => (
    variant.mode === 'merged'
      ? <Typography component="span" variant="caption" fontWeight='bold'>{t('optional')}: {t(settingKey)}</Typography>
      : null
  )

  const cheatSheetRows = useMemo<CheatSheetRow[]>(() => {
    const rows: CheatSheetRow[] = [
      {
        actor: 'any',
        action: Actions.Income,
        details: [
          t(Actions.Income),
          t('collectCoins', { count: 1 })
        ]
      },
      {
        actor: 'any',
        action: Actions.ForeignAid,
        details: [
          t(Actions.ForeignAid),
          t('collectCoins', { count: 2 })
        ]
      },
      {
        actor: 'any',
        action: Actions.Coup,
        details: [
          t(Actions.Coup),
          t('payCoins', { count: 7 }),
          t('killAnInfluence')
        ]
      },
    ]

    if (variant.showRevive) {
      rows.push({
        actor: 'any',
        action: Actions.Revive,
        details: [
          t(Actions.Revive),
          t('payCoins', { count: 10 }),
          t('reviveAnInfluence'),
          optionalNote('allowRevive')
        ].filter(Boolean),
      })
    }

    if (variant.showReformation) {
      rows.push(
        {
          actor: 'any',
          action: Actions.Convert,
          details: [
            t(Actions.Convert),
            t('changeYourAllegiance'),
            t('changeAnotherPlayersAllegiance'),
            optionalNote('enableReformation')
          ].filter(Boolean),
        },
        {
          actor: 'any',
          action: Actions.Embezzle,
          details: [
            t(Actions.Embezzle),
            t('takeAllTreasuryReserveCoins'),
            optionalNote('enableReformation')
          ].filter(Boolean),
        }
      )
    }

    rows.push(
      {
        actor: Influences.Duke,
        influence: Influences.Duke,
        details: [
          t(Actions.Tax),
          t('collectCoins', { count: 3 }),
          <>{t('block')} {t(Actions.ForeignAid)}</>
        ]
      },
      {
        actor: Influences.Assassin,
        influence: Influences.Assassin,
        details: [
          t(Actions.Assassinate),
          t('payCoins', { count: 3 }),
          t('killAnInfluence')
        ]
      },
      {
        actor: Influences.Captain,
        influence: Influences.Captain,
        details: [
          t(Actions.Steal),
          t('steal2CoinsFromSomeone'),
          <>{t('block')} {t(Actions.Steal)}</>
        ]
      }
    )

    if (variant.showAmbassador) {
      rows.push({
        actor: Influences.Ambassador,
        influence: Influences.Ambassador,
        details: [
          t(Actions.Exchange),
          t('draw2InfluencesAndDiscard2'),
          <>{t('block')} {t(Actions.Steal)}</>
        ]
      })
    }

    if (variant.showInquisitor) {
      rows.push({
        actor: Influences.Inquisitor,
        influence: Influences.Inquisitor,
        details: [
          t(Actions.Exchange),
          t('exchangeOneCardWithCourtDeck'),
          t('inspectOpponentInfluence'),
          <>{t('block')} {t(Actions.Steal)}</>,
          variant.mode === 'merged'
            ? <Typography component="span" variant="caption" fontWeight='bold'>{t('rulesInquisitorReplacement')}</Typography>
            : null,
          optionalNote('enableInquisitor')
        ].filter(Boolean)
      })
    }

    rows.push({
      actor: Influences.Contessa,
      influence: Influences.Contessa,
      details: [
        <>{t('block')} {t(Actions.Assassinate)}</>,
        ...(variant.showContessaBlockExamine
          ? [
            <>{t('block')} {t(Actions.Examine)}</>,
            optionalNote('allowContessaBlockExamine')
          ]
          : []
        )
      ].filter(Boolean)
    })

    return rows
  }, [optionalNote, t, variant])

  const anyIndicator = (
    <>
      <Group sx={{ mb: -1 }} />
      <br />
      <span style={{ verticalAlign: 'middle' }}>{` ${t('anyone')}`}</span>
    </>
  )

  const renderCheatSheetDetails = (details: ReactNode[]) =>
    details.map((detail, index) => (
      <span key={index}>
        {index > 0 && <br />}
        {detail}
      </span>
    ))

  return (
    <DialogContent sx={{
      px: 4,
      [breakpoints.up('md')]: { px: undefined },
      textAlign: 'center'
    }}>
      <DialogContentText component='div'>
        <Typography
          variant="h4"
          sx={{ fontWeight: "bold" }}
        >{t('cheatSheet')}</Typography>
        <Box sx={{ mt: 3 }}>
          <table className="cheat-sheet-table">
            <tbody>
              {cheatSheetRows.map(({ actor, action, details, influence }, index) => (
                <tr
                  key={`${actor}-${action ?? influence}-${index}`}
                  style={{ background: action ? actionColors[action] : influenceColors[influence!] }}
                >
                  <td>
                    {actor === 'any'
                      ? anyIndicator
                      : (
                        <>
                          <InfluenceIcon influence={actor} />
                          <br />
                          {t(actor)}
                        </>
                      )}
                  </td>
                  <td>{renderCheatSheetDetails(details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Divider sx={{ my: 8 }} />
        <Typography
          variant="h4"
          sx={{ fontWeight: 'bold' }}
        >{t('fullRules')}</Typography>
        <Box sx={{ textAlign: 'left' }}>
          <p><strong>{t('numberOfPlayers')}</strong>: 2-{MAX_PLAYER_COUNT}.</p>
          <p><strong>{t('goal')}</strong>: {t('rulesGoal')}</p>
          <p>
            <strong>{t('contents')}</strong>: {t('rulesContents')}
            {variant.showReformation && <> {t('rulesContentsReformation')}</>}
          </p>
          <p><strong>{t('setup')}</strong>: {t('rulesSetup')}</p>
          {variant.showReformation && <p>{t('rulesSetupReformation')}</p>}
          <p><strong>{t('influences')}</strong>: {t('rulesInfluences')}</p>
          {variant.showInquisitor && <p>{t('rulesInquisitorReplacement')}</p>}
          <ul>
            <li>{renderInfluenceText(Influences.Duke)}: {t('rulesDuke')}</li>
            <li>{renderInfluenceText(Influences.Assassin)}: {t('rulesAssassin')}</li>
            <li>{renderInfluenceText(Influences.Captain)}: {t('rulesCaptain')}</li>
            {variant.showAmbassador && (
              <li>
                {renderInfluenceText(Influences.Ambassador)}: {t('rulesAmbassador')}
                {variant.mode === 'merged' && <> <em>({t('optional')}: {t('enableInquisitor')} off)</em></>}
              </li>
            )}
            {variant.showInquisitor && (
              <li>
                {renderInfluenceText(Influences.Inquisitor)}: {t('rulesInquisitor')}
                {variant.mode === 'merged' && <> <em>({t('optional')}: {t('enableInquisitor')})</em></>}
              </li>
            )}
            <li>
              {renderInfluenceText(Influences.Contessa)}: {t('rulesContessa')}
              {variant.showContessaBlockExamine && <> {t('rulesContessaBlockExamine')}</>}
            </li>
          </ul>
          <p><strong>{t('actions')}</strong>: {t('rulesActions')}</p>
          <ul>
            <li>{renderActionText(Actions.Income)}: {t('rulesIncome')}</li>
            <li>{renderActionText(Actions.ForeignAid)}: {t('rulesForeignAid')}</li>
            <li>{renderActionText(Actions.Coup)}: {t('rulesCoup')}</li>
            {variant.showRevive && (
              <li>
                {renderActionText(Actions.Revive)}: {t('rulesRevive')}
                {variant.mode === 'merged' && <> <em>({t('optional')}: {t('allowRevive')})</em></>}
              </li>
            )}
            <li>{renderActionText(Actions.Tax)}: {t('rulesTax')}</li>
            <li>{renderActionText(Actions.Assassinate)}: {t('rulesAssassinate')}</li>
            <li>{renderActionText(Actions.Steal)}: {t('rulesSteal')}</li>
            <li>
              {renderActionText(Actions.Exchange)}: {variant.showInquisitor && !variant.showAmbassador
                ? t('rulesExchangeInquisitor')
                : t('rulesExchange')}
            </li>
            {variant.showInquisitor && (
              <li>
                {renderActionText(Actions.Examine)}: {t('rulesExamine')}
                {variant.mode === 'merged' && <> <em>({t('optional')}: {t('enableInquisitor')})</em></>}
              </li>
            )}
            {variant.showReformation && (
              <>
                <li>
                  {renderActionText(Actions.Convert)}: {t('rulesConvert')}
                  {variant.mode === 'merged' && <> <em>({t('optional')}: {t('enableReformation')})</em></>}
                </li>
                <li>
                  {renderActionText(Actions.Embezzle)}: {t('rulesEmbezzle')}
                  {variant.mode === 'merged' && <> <em>({t('optional')}: {t('enableReformation')})</em></>}
                </li>
              </>
            )}
          </ul>
          {variant.showReformation && (
            <>
              <p><strong>{t('enableReformation')}</strong>: {t('rulesReformationRestrictions')}</p>
              <p><strong>{t('treasuryReserve')}</strong>: {t('rulesTreasuryReserve')}</p>
              {variant.showInquisitor && (
                <p>{t('rulesExamineAllegianceRestriction')}</p>
              )}
            </>
          )}
          <p><strong>{t('challenge')}</strong>: {t('rulesChallenge')}</p>
          <p><strong>{t('block')}</strong>: {t('rulesBlock')}</p>
          <p><strong>{t('losingAChallenge')}</strong>: {t('rulesLosingAChallenge')}</p>
          <p><strong>{t('losingInfluence')}</strong>: {t('rulesLosingInfluence')}</p>
        </Box>
      </DialogContentText>
    </DialogContent>
  )
}

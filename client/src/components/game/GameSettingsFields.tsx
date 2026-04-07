import { ChangeEvent, SyntheticEvent } from 'react'
import { Box, Grid, Slider, Switch } from '@mui/material'
import CoupTypography from '../utilities/CoupTypography'
import { EditableGameSettings } from '../../helpers/gameSettings'
import { useTranslationContext } from '../../contexts/TranslationsContext'

function GameSettingsFields({
  settings,
  onChange,
  disabled = false,
}: Readonly<{
  settings: EditableGameSettings
  onChange: (settings: EditableGameSettings, options?: { autoSave?: boolean }) => void
  disabled?: boolean
}>) {
  const { t } = useTranslationContext()

  return (
    <>
      <Grid sx={{ maxWidth: '300px', width: '90%' }}>
        <Box mt={2}>
          <CoupTypography mt={2} addTextShadow>
            {t('eventLogRetentionTurns')}
            {`: ${settings.eventLogRetentionTurns}`}
          </CoupTypography>
          <Slider
            data-testid="eventLogRetentionTurnsInput"
            step={1}
            value={settings.eventLogRetentionTurns}
            valueLabelDisplay="auto"
            min={1}
            max={100}
            disabled={disabled}
            onChange={(_: Event, value: number | number[]) => {
              onChange({
                ...settings,
                eventLogRetentionTurns: value as number,
              })
            }}
            onChangeCommitted={(_: Event | SyntheticEvent<Element, Event>, value: number | number[]) => {
              onChange({
                ...settings,
                eventLogRetentionTurns: value as number,
              }, { autoSave: true })
            }}
          />
        </Box>
      </Grid>
      <Grid sx={{ maxWidth: '300px', width: '90%' }}>
        <Box mt={2}>
          <CoupTypography component="span" mt={2} addTextShadow>
            {t('allowRevive')}:
          </CoupTypography>
          <Switch
            checked={settings.allowRevive}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onChange({
                ...settings,
                allowRevive: event.target.checked,
              }, { autoSave: true })
            }}
            slotProps={{ input: { 'aria-label': 'controlled' } }}
          />
        </Box>
      </Grid>
      <Grid sx={{ maxWidth: '300px', width: '90%' }}>
        <Box mt={2}>
          <CoupTypography component="span" mt={2} addTextShadow>
            {t('speedRound')}:
          </CoupTypography>
          <Switch
            checked={settings.speedRoundEnabled}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onChange({
                ...settings,
                speedRoundEnabled: event.target.checked,
              }, { autoSave: true })
            }}
            slotProps={{ input: { 'aria-label': 'controlled' } }}
          />
        </Box>
      </Grid>
      {settings.speedRoundEnabled && (
        <Grid sx={{ maxWidth: '300px', width: '90%' }}>
          <Box mt={2}>
            <CoupTypography mt={2} addTextShadow>
              {t('speedRoundSeconds')}
              {`: ${settings.speedRoundSeconds}`}
            </CoupTypography>
            <Slider
              data-testid="speedRoundSecondsInput"
              step={1}
              value={settings.speedRoundSeconds}
              valueLabelDisplay="auto"
              min={5}
              max={60}
              disabled={disabled}
              onChange={(_: Event, value: number | number[]) => {
                onChange({
                  ...settings,
                  speedRoundSeconds: value as number,
                })
              }}
              onChangeCommitted={(_: Event | SyntheticEvent<Element, Event>, value: number | number[]) => {
                onChange({
                  ...settings,
                  speedRoundSeconds: value as number,
                }, { autoSave: true })
              }}
            />
          </Box>
        </Grid>
      )}
      <Grid sx={{ maxWidth: '300px', width: '90%' }}>
        <Box mt={2}>
          <CoupTypography component="span" mt={2} addTextShadow>
            {t('enableReformation')}:
          </CoupTypography>
          <Switch
            checked={settings.enableReformation}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onChange({
                ...settings,
                enableReformation: event.target.checked,
              }, { autoSave: true })
            }}
            slotProps={{ input: { 'aria-label': 'controlled' } }}
          />
        </Box>
      </Grid>
      <Grid sx={{ maxWidth: '300px', width: '90%' }}>
        <Box mt={2}>
          <CoupTypography component="span" mt={2} addTextShadow>
            {t('enableInquisitor')}:
          </CoupTypography>
          <Switch
            checked={settings.enableInquisitor}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const enabled = event.target.checked
              onChange({
                ...settings,
                enableInquisitor: enabled,
                allowContessaBlockExamine: enabled && settings.allowContessaBlockExamine,
              }, { autoSave: true })
            }}
            slotProps={{ input: { 'aria-label': 'controlled' } }}
          />
        </Box>
      </Grid>
      {settings.enableInquisitor && (
        <Grid sx={{ maxWidth: '300px', width: '90%' }}>
          <Box mt={2}>
            <CoupTypography component="span" mt={2} addTextShadow>
              {t('allowContessaBlockExamine')}:
            </CoupTypography>
            <Switch
              checked={settings.allowContessaBlockExamine}
              disabled={disabled}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                onChange({
                  ...settings,
                  allowContessaBlockExamine: event.target.checked,
                }, { autoSave: true })
              }}
              slotProps={{ input: { 'aria-label': 'controlled' } }}
            />
          </Box>
        </Grid>
      )}
    </>
  )
}

export default GameSettingsFields

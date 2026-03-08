import { Breadcrumbs, Link } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router'
import { useTranslationContext } from '../contexts/TranslationsContext'
import CoupTypography from './utilities/CoupTypography'
import { Translations } from '../i18n/translations'
import { useAuthContext } from '../contexts/AuthContext'

const routeLabels: Record<string, keyof Translations> = {
  'create-game': 'createNewGame',
  'join-game': 'joinExistingGame',
  leaderboard: 'leaderboard',
  profile: 'profile',
}

function AppBreadcrumbs() {
  const { pathname } = useLocation()
  const { t } = useTranslationContext()
  const { isLocalAuth } = useAuthContext()

  const segment = pathname.split('/').find(Boolean)
  if (!segment) return null

  if (isLocalAuth && (segment === 'leaderboard' || segment === 'profile')) {
    return null
  }

  const labelKey = routeLabels[segment]
  if (!labelKey) return null

  return (
    <Breadcrumbs sx={{ m: 2 }} aria-label="breadcrumb">
      <Link component={RouterLink} to="/"><CoupTypography addTextShadow>{t('home')}</CoupTypography></Link>
      <CoupTypography addTextShadow>{t(labelKey)}</CoupTypography>
    </Breadcrumbs>
  )
}

export default AppBreadcrumbs

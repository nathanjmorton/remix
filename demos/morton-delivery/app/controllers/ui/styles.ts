import { css } from 'remix/component'

const tokens = {
  color: {
    ink: '#0f172a',
    subtle: '#475569',
    muted: '#64748b',
    surface: '#ffffff',
    surfaceMuted: '#f8fafc',
    border: '#e2e8f0',
    accent: '#b91c1c',
    accentDark: '#7f1d1d',
    accentTint: '#fef2f2',
  },
  font: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
}

export const reset = css({
  '& *': {
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
  },
  '& h1, & h2, & h3': {
    lineHeight: 1.2,
  },
  '& a': {
    color: 'inherit',
  },
})

export const page = css({
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: tokens.font.sans,
  color: tokens.color.ink,
  backgroundColor: tokens.color.surfaceMuted,
  lineHeight: 1.6,
})

export const container = css({
  width: '100%',
  maxWidth: '64rem',
  margin: '0 auto',
  padding: '0 1.5rem',
})

export const header = css({
  backgroundColor: tokens.color.surface,
  borderBottom: `1px solid ${tokens.color.border}`,
})

export const headerInner = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '1rem 0',
  gap: '1.5rem',
  flexWrap: 'wrap',
})

export const brand = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  textDecoration: 'none',
  color: tokens.color.ink,
})

export const brandMark = css({
  width: '2.5rem',
  height: '2.5rem',
  flexShrink: 0,
})

export const brandText = css({
  display: 'flex',
  flexDirection: 'column',
  lineHeight: 1.1,
})

export const brandName = css({
  fontWeight: 700,
  fontSize: '1.05rem',
})

export const brandTag = css({
  fontSize: '0.75rem',
  color: tokens.color.muted,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
})

export const nav = css({
  display: 'flex',
  alignItems: 'center',
  gap: '1.5rem',
  fontSize: '0.95rem',
})

export const navLink = css({
  textDecoration: 'none',
  color: tokens.color.subtle,
  fontWeight: 500,
  '&:hover': {
    color: tokens.color.accent,
  },
})

export const main = css({
  flex: 1,
  padding: '3rem 0',
})

export const hero = css({
  display: 'grid',
  gap: '2rem',
  gridTemplateColumns: '1fr',
  alignItems: 'center',
  padding: '2rem 0 3rem',
  '@media (min-width: 768px)': {
    gridTemplateColumns: '1.2fr 1fr',
  },
})

export const heroEyebrow = css({
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontSize: '0.8rem',
  color: tokens.color.accent,
  fontWeight: 600,
  marginBottom: '0.75rem',
})

export const heroTitle = css({
  fontSize: '2.5rem',
  fontWeight: 700,
  marginBottom: '1rem',
  '@media (min-width: 768px)': {
    fontSize: '3rem',
  },
})

export const heroLead = css({
  color: tokens.color.subtle,
  fontSize: '1.1rem',
  marginBottom: '1.5rem',
  maxWidth: '32rem',
})

export const heroArt = css({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '1.5rem',
  backgroundColor: tokens.color.surface,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: '1rem',
  boxShadow: '0 10px 30px -15px rgba(15, 23, 42, 0.25)',
})

export const heroArtLogo = css({
  width: '100%',
  maxWidth: '20rem',
  height: 'auto',
})

export const buttonRow = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
})

export const buttonPrimary = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.7rem 1.25rem',
  borderRadius: '0.5rem',
  backgroundColor: tokens.color.accent,
  color: tokens.color.surface,
  fontWeight: 600,
  textDecoration: 'none',
  border: '1px solid transparent',
  transition: 'background-color 0.15s ease',
  '&:hover': {
    backgroundColor: tokens.color.accentDark,
  },
})

export const buttonSecondary = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.7rem 1.25rem',
  borderRadius: '0.5rem',
  backgroundColor: tokens.color.surface,
  color: tokens.color.ink,
  fontWeight: 600,
  textDecoration: 'none',
  border: `1px solid ${tokens.color.border}`,
  transition: 'border-color 0.15s ease',
  '&:hover': {
    borderColor: tokens.color.subtle,
  },
})

export const sectionTitle = css({
  fontSize: '1.75rem',
  fontWeight: 700,
  marginBottom: '0.75rem',
})

export const lead = css({
  color: tokens.color.subtle,
  fontSize: '1.05rem',
  maxWidth: '40rem',
  marginBottom: '2rem',
})

export const cardGrid = css({
  display: 'grid',
  gap: '1rem',
  gridTemplateColumns: '1fr',
  '@media (min-width: 640px)': {
    gridTemplateColumns: '1fr 1fr',
  },
})

export const card = css({
  backgroundColor: tokens.color.surface,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: '0.75rem',
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
})

export const cardTitle = css({
  fontSize: '1.05rem',
  fontWeight: 600,
})

export const cardBody = css({
  color: tokens.color.subtle,
  fontSize: '0.95rem',
})

export const contactBlock = css({
  display: 'grid',
  gap: '1rem',
  gridTemplateColumns: '1fr',
  '@media (min-width: 640px)': {
    gridTemplateColumns: 'repeat(3, 1fr)',
  },
})

export const contactItem = css({
  backgroundColor: tokens.color.surface,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: '0.75rem',
  padding: '1.25rem',
})

export const contactLabel = css({
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: tokens.color.muted,
  marginBottom: '0.25rem',
})

export const contactValue = css({
  fontSize: '1rem',
  fontWeight: 600,
  color: tokens.color.ink,
})

export const placeholderNote = css({
  marginTop: '2rem',
  padding: '1rem 1.25rem',
  borderRadius: '0.75rem',
  backgroundColor: tokens.color.accentTint,
  color: tokens.color.accentDark,
  fontSize: '0.9rem',
})

export const footer = css({
  borderTop: `1px solid ${tokens.color.border}`,
  backgroundColor: tokens.color.surface,
  padding: '1.5rem 0',
  color: tokens.color.muted,
  fontSize: '0.85rem',
})

export const footerInner = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
})

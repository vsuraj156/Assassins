import nodemailer from 'nodemailer'

const FROM = 'Quincy Assassins <quincyassassins@gmail.com>'
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://quincyassassins.vercel.app'
const REPLY_LINE = '<p>If you have any questions, please reply to this email and we will respond as soon as possible.</p>'

function createTransport() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return null
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })
}

async function send({ to, subject, html }: { to: string; subject: string; html: string }) {
  const transporter = createTransport()
  if (!transporter) {
    console.warn('Gmail credentials not set — skipping email')
    return
  }
  const wrapped = `<div style="font-family:'Courier New',Courier,monospace;font-size:14px;color:#222;">${html}</div>`
  try {
    await transporter.sendMail({ from: FROM, to, subject, html: wrapped })
  } catch (err) {
    console.error('Email send error:', err)
  }
}

export async function sendStatusChangeEmail(
  to: string,
  playerName: string,
  oldStatus: string,
  newStatus: string,
  reason?: string
) {
  await send({
    to,
    subject: `[Quincy Assassins] Status Update: ${newStatus.toUpperCase()}`,
    html: `
      <h2>Status Update</h2>
      <p>Dear ${playerName},</p>
      <p>Your status has been updated from <strong>${oldStatus}</strong> to <strong>${newStatus}</strong>.</p>
      ${reason ? `<p>Reason: ${reason}</p>` : ''}
      <p><a href="${SITE_URL}/dashboard">View your dashboard</a></p>
      ${REPLY_LINE}
    `,
  })
}

export async function sendTargetUpdateEmail(to: string, playerName: string, targetTeamName: string) {
  await send({
    to,
    subject: '[Quincy Assassins] New Target Assigned',
    html: `
      <h2>New Target Assigned</h2>
      <p>Dear ${playerName},</p>
      <p>Your team has been assigned a new target: <strong>${targetTeamName}</strong>.</p>
      <p><a href="${SITE_URL}/target">View your target details</a></p>
      ${REPLY_LINE}
    `,
  })
}

export async function sendNameRejectedEmail(
  to: string,
  name: string,
  type: 'team name' | 'code name',
  reason: string
) {
  await send({
    to,
    subject: `[Quincy Assassins] ${type.charAt(0).toUpperCase() + type.slice(1)} Rejected`,
    html: `
      <h2>${type.charAt(0).toUpperCase() + type.slice(1)} Rejected</h2>
      <p>Your ${type} "<strong>${name}</strong>" has been rejected.</p>
      <p>Reason: ${reason}</p>
      <p>Please log in and submit a new ${type} at your earliest convenience.</p>
      <p><a href="${SITE_URL}/dashboard">Log in to resubmit</a></p>
      ${REPLY_LINE}
    `,
  })
}

export async function sendKillClaimEmail(to: string, targetName: string, killerName: string) {
  await send({
    to,
    subject: '[Quincy Assassins] Kill Claim Filed Against You',
    html: `
      <h2>Kill Claim Filed</h2>
      <p>Dear ${targetName},</p>
      <p><strong>${killerName}</strong> has filed a kill claim against you. The claim is currently under review by an administrator.</p>
      <p><a href="${SITE_URL}/dashboard">View your current status</a></p>
      ${REPLY_LINE}
    `,
  })
}

export async function sendCheckinRejectedEmail(to: string, playerName: string) {
  await send({
    to,
    subject: '[Quincy Assassins] Check-In Rejected',
    html: `
      <h2>Check-In Rejected</h2>
      <p>Dear ${playerName},</p>
      <p>Your check-in submission has been rejected by an administrator. Please resubmit with a valid meal photo before midnight, or your status will be updated.</p>
      <p><a href="${SITE_URL}/checkin">Submit a new check-in</a></p>
      ${REPLY_LINE}
    `,
  })
}

export async function sendGoldenGunEmail(to: string, playerName: string, expiresAt: Date) {
  const expiryStr = expiresAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  await send({
    to,
    subject: '[Quincy Assassins] The Golden Gun',
    html: `
      <h2>The Golden Gun</h2>
      <p>Dear ${playerName},</p>
      <p>You are now in possession of the Golden Gun. You are authorized to eliminate any player in the game until <strong>${expiryStr} EDT</strong>.</p>
      <p><strong>The gun must be returned to MI6's Levesque Room by ${expiryStr}.</strong> Failure to do so will result in all kills from today being voided and your entire team being exposed at midnight.</p>
      <p>The gun is non-transferrable and remains with you even in the event of your elimination.</p>
      <p><a href="${SITE_URL}/dashboard">View your dashboard</a></p>
      ${REPLY_LINE}
    `,
  })
}

export async function sendPhotoRejectedEmail(to: string, playerName: string, reason: string) {
  await send({
    to,
    subject: '[Quincy Assassins] Profile Photo Rejected',
    html: `
      <h2>Profile Photo Rejected</h2>
      <p>Dear ${playerName},</p>
      <p>Your profile photo has been rejected.</p>
      <p>Reason: ${reason}</p>
      <p>Please log in and upload a new photo.</p>
      <p><a href="${SITE_URL}/dashboard">Go to your dashboard</a></p>
      ${REPLY_LINE}
    `,
  })
}

export async function sendKillApprovedEmail(
  to: string,
  killerName: string,
  targetName: string,
  points: number
) {
  await send({
    to,
    subject: '[Quincy Assassins] Elimination Confirmed',
    html: `
      <h2>Elimination Confirmed</h2>
      <p>Dear ${killerName},</p>
      <p>Your elimination of <strong>${targetName}</strong> has been approved. Your team has been awarded <strong>${points} point${points > 1 ? 's' : ''}</strong>.</p>
      <p><a href="${SITE_URL}/log">View the kill log</a></p>
      ${REPLY_LINE}
    `,
  })
}

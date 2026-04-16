import nodemailer from 'nodemailer'

const FROM = 'Quincy Assassins <quincyassassins@gmail.com>'

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
  try {
    await transporter.sendMail({ from: FROM, to, subject, html })
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
    subject: `[Quincy Assassins] Your status changed: ${newStatus.toUpperCase()}`,
    html: `
      <h2>Status Update</h2>
      <p>Hi ${playerName},</p>
      <p>Your status has changed from <strong>${oldStatus}</strong> to <strong>${newStatus}</strong>.</p>
      ${reason ? `<p>Reason: ${reason}</p>` : ''}
      <p>Log in to check your current situation.</p>
    `,
  })
}

export async function sendTargetUpdateEmail(to: string, playerName: string) {
  await send({
    to,
    subject: '[Quincy Assassins] Your target has changed',
    html: `
      <h2>New Target Assigned</h2>
      <p>Hi ${playerName},</p>
      <p>Your team has a new target. Log in to see who you're hunting.</p>
    `,
  })
}

export async function sendCheckinReminderEmail(to: string, playerName: string) {
  await send({
    to,
    subject: '[Quincy Assassins] Check-in reminder — act now!',
    html: `
      <h2>Don't forget to check in!</h2>
      <p>Hi ${playerName},</p>
      <p>You haven't checked in today. Submit your meal photo before midnight or your status will be updated.</p>
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
    subject: `[Quincy Assassins] Your ${type} was rejected`,
    html: `
      <h2>${type.charAt(0).toUpperCase() + type.slice(1)} Rejected</h2>
      <p>Your ${type} "<strong>${name}</strong>" was rejected.</p>
      <p>Reason: ${reason}</p>
      <p>Please log in and submit a new ${type}.</p>
    `,
  })
}

export async function sendKillClaimEmail(to: string, targetName: string, killerName: string) {
  await send({
    to,
    subject: '[Quincy Assassins] A kill claim has been filed against you',
    html: `
      <h2>Kill Claim Filed</h2>
      <p>Hi ${targetName},</p>
      <p><strong>${killerName}</strong> has filed a kill claim against you. An admin will review it shortly.</p>
      <p>Log in to see your current status.</p>
    `,
  })
}

export async function sendCheckinRejectedEmail(to: string, playerName: string) {
  await send({
    to,
    subject: '[Quincy Assassins] Your check-in was rejected',
    html: `
      <h2>Check-in Rejected</h2>
      <p>Hi ${playerName},</p>
      <p>Your check-in submission was rejected by an admin. Please resubmit with a valid meal photo.</p>
      <p>Remember: you need an approved check-in before midnight or your status will be updated.</p>
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
    subject: '[Quincy Assassins] Kill confirmed',
    html: `
      <h2>Kill Confirmed</h2>
      <p>Hi ${killerName},</p>
      <p>Your elimination of <strong>${targetName}</strong> has been approved! Your team earned <strong>${points} point${points > 1 ? 's' : ''}</strong>.</p>
    `,
  })
}

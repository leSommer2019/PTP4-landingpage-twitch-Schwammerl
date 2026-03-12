#!/usr/bin/env node
// ──────────────────────────────────────────────────────────
//  manage-rounds.mjs  –  Daily round lifecycle management
//  Also handles manual actions via workflow_dispatch.
// ──────────────────────────────────────────────────────────

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ACTION = 'auto',
} = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

// ── Helpers ──────────────────────────────────────────────

async function sbGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: HEADERS })
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbPatch(table, query, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH', headers: HEADERS, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbDelete(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE', headers: HEADERS,
  })
  if (!res.ok) throw new Error(`DELETE ${table}: ${res.status} ${await res.text()}`)
}

// ── Get top N clips by vote count for a round ───────────

async function getTopClips(roundId, n) {
  return sbGet('clip_vote_counts',
    `round_id=eq.${roundId}&order=vote_count.desc,view_count.desc&limit=${n}`)
}

// ── Complete a round and determine winner ────────────────

async function completeRound2(round) {
  await sbPatch('voting_rounds', `id=eq.${round.id}`, { status: 'completed' })
  console.log(`Completed round2 ${round.id}`)

  const top = await getTopClips(round.id, 1)
  if (top.length === 0) { console.log('No votes – no winner'); return }

  const winner = top[0]
  try {
    await sbPost('monthly_winners', {
      year: round.year,
      month: round.month,
      clip_id: winner.clip_id,
    })
    console.log(`Monthly winner ${round.month}/${round.year}: ${winner.title}`)
  } catch (err) {
    console.warn('Monthly winner already exists or error:', err.message)
  }
}

// ── Cleanup old data ─────────────────────────────────────

async function cleanup() {
  // Get all clip IDs referenced by monthly/yearly winners
  const monthlyWinners = await sbGet('monthly_winners', 'select=clip_id')
  const yearlyWinners  = await sbGet('yearly_winners', 'select=clip_id')
  const winnerClipIds = new Set([
    ...monthlyWinners.map(w => w.clip_id),
    ...yearlyWinners.map(w => w.clip_id),
  ])

  // Get completed rounds older than 2 months
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 2)
  const oldRounds = await sbGet('voting_rounds',
    `status=eq.completed&created_at=lt.${cutoff.toISOString()}&select=id`)

  for (const round of oldRounds) {
    // Get clips in this round
    const roundClips = await sbGet('round_clips',
      `round_id=eq.${round.id}&select=clip_id`)

    // Delete round_clips
    await sbDelete('round_clips', `round_id=eq.${round.id}`)

    // Delete clips that aren't winners and aren't in other rounds
    for (const rc of roundClips) {
      if (winnerClipIds.has(rc.clip_id)) continue
      const otherLinks = await sbGet('round_clips',
        `clip_id=eq.${rc.clip_id}&select=round_id`)
      if (otherLinks.length === 0) {
        try { await sbDelete('clips', `id=eq.${rc.clip_id}`) } catch { /* ignore */ }
      }
    }

    // Delete votes for old round
    await sbDelete('votes', `round_id=eq.${round.id}`)

    // Delete the old round itself
    await sbDelete('voting_rounds', `id=eq.${round.id}`)
    console.log(`Cleaned up old round ${round.id}`)
  }
}

// ── Auto actions (daily cron) ────────────────────────────

async function runAuto() {
  const now = new Date()
  const day = now.getUTCDate()

  // 1) Complete expired active rounds
  const activeRounds = await sbGet('voting_rounds',
    `status=eq.active&ends_at=lte.${now.toISOString()}&order=created_at.desc`)

  for (const round of activeRounds) {
    if (round.type === 'round1') {
      // Complete round 1 → create pending round 2 with top 10
      await sbPatch('voting_rounds', `id=eq.${round.id}`, { status: 'completed' })
      console.log(`Completed round1 ${round.id}`)

      const top10 = await getTopClips(round.id, 10)
      if (top10.length === 0) { console.log('No clips/votes in round1'); continue }

      const [round2] = await sbPost('voting_rounds', {
        type: 'round2',
        status: 'pending',
        year: round.year,
        month: round.month,
      })
      console.log(`Created pending round2 ${round2.id}`)

      for (const clip of top10) {
        try { await sbPost('round_clips', { round_id: round2.id, clip_id: clip.clip_id }) } catch { /* dup */ }
      }
    }

    if (round.type === 'round2') {
      await completeRound2(round)
    }

    if (round.type === 'yearly') {
      await sbPatch('voting_rounds', `id=eq.${round.id}`, { status: 'completed' })
      const top = await getTopClips(round.id, 1)
      if (top.length > 0) {
        try {
          await sbPost('yearly_winners', { year: round.year, clip_id: top[0].clip_id })
          console.log(`Yearly winner ${round.year}: ${top[0].title}`)
        } catch (err) { console.warn('Yearly winner error:', err.message) }
      }
    }
  }

  // 2) Auto-start round 2 on the 13th if still pending
  if (day >= 13) {
    const pendingR2 = await sbGet('voting_rounds',
      'status=eq.pending&type=eq.round2&order=created_at.desc&limit=1')

    if (pendingR2.length > 0) {
      const r2 = pendingR2[0]
      const endsAt = `${r2.year}-${String(r2.month === 12 ? 1 : r2.month + 1).padStart(2, '0')}-20T23:59:59Z`
      const endsYear = r2.month === 12 ? r2.year + 1 : r2.year
      const endsAtFixed = `${endsYear}-${String(r2.month === 12 ? 1 : r2.month + 1).padStart(2, '0')}-20T23:59:59Z`

      await sbPatch('voting_rounds', `id=eq.${r2.id}`, {
        status: 'active',
        starts_at: now.toISOString(),
        ends_at: endsAtFixed,
      })
      console.log(`Auto-started round2 ${r2.id}, ends ${endsAtFixed}`)
    }
  }

  // 3) Check if November round 2 just completed → create yearly voting
  const novR2 = await sbGet('voting_rounds',
    `type=eq.round2&status=eq.completed&month=eq.11&order=year.desc&limit=1`)

  if (novR2.length > 0) {
    const yr = novR2[0].year
    // Check if yearly round already exists
    const existingYearly = await sbGet('voting_rounds',
      `type=eq.yearly&year=eq.${yr}&select=id`)

    if (existingYearly.length === 0) {
      // Collect monthly winners Dec(yr-1) through Nov(yr)
      const winners = await sbGet('monthly_winners',
        `or=(and(year.eq.${yr - 1},month.eq.12),and(year.eq.${yr},month.lte.11))&select=clip_id`)

      if (winners.length > 0) {
        const [yearlyRound] = await sbPost('voting_rounds', {
          type: 'yearly',
          status: 'active',
          year: yr,
          starts_at: now.toISOString(),
          ends_at: `${yr}-12-20T23:59:59Z`,
        })
        for (const w of winners) {
          try { await sbPost('round_clips', { round_id: yearlyRound.id, clip_id: w.clip_id }) } catch { /* dup */ }
        }
        console.log(`Created yearly round ${yearlyRound.id} with ${winners.length} clips`)
      }
    }
  }

  // 4) Cleanup
  await cleanup()
}

// ── Manual actions (workflow_dispatch) ────────────────────

async function manualStartRound2() {
  const pending = await sbGet('voting_rounds',
    'status=eq.pending&type=eq.round2&order=created_at.desc&limit=1')
  if (pending.length === 0) { console.log('No pending round2 found'); return }

  const r2 = pending[0]
  const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await sbPatch('voting_rounds', `id=eq.${r2.id}`, {
    status: 'active',
    starts_at: new Date().toISOString(),
    ends_at: endsAt,
  })
  console.log(`Manually started round2 ${r2.id}, ends ${endsAt}`)
}

async function manualEndRound2() {
  const active = await sbGet('voting_rounds',
    'status=eq.active&type=eq.round2&order=created_at.desc&limit=1')
  if (active.length === 0) { console.log('No active round2 found'); return }
  await completeRound2(active[0])
}

async function manualStartYearly() {
  const now = new Date()
  const currentYear = now.getUTCFullYear()

  const existing = await sbGet('voting_rounds',
    `type=eq.yearly&year=eq.${currentYear}&select=id`)
  if (existing.length > 0) { console.log('Yearly round already exists'); return }

  const winners = await sbGet('monthly_winners',
    `or=(and(year.eq.${currentYear - 1},month.eq.12),and(year.eq.${currentYear},month.lte.11))&select=clip_id`)

  if (winners.length === 0) { console.log('No monthly winners found'); return }

  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const [yearlyRound] = await sbPost('voting_rounds', {
    type: 'yearly',
    status: 'active',
    year: currentYear,
    starts_at: now.toISOString(),
    ends_at: endsAt,
  })
  for (const w of winners) {
    try { await sbPost('round_clips', { round_id: yearlyRound.id, clip_id: w.clip_id }) } catch { /* dup */ }
  }
  console.log(`Created yearly round ${yearlyRound.id} with ${winners.length} clips`)
}

async function manualEndYearly() {
  const active = await sbGet('voting_rounds',
    'status=eq.active&type=eq.yearly&order=created_at.desc&limit=1')
  if (active.length === 0) { console.log('No active yearly round found'); return }

  const round = active[0]
  await sbPatch('voting_rounds', `id=eq.${round.id}`, { status: 'completed' })
  const top = await getTopClips(round.id, 1)
  if (top.length > 0) {
    try {
      await sbPost('yearly_winners', { year: round.year, clip_id: top[0].clip_id })
      console.log(`Yearly winner ${round.year}: ${top[0].title}`)
    } catch (err) { console.warn('Yearly winner error:', err.message) }
  }
}

// ── Entrypoint ───────────────────────────────────────────

async function main() {
  console.log(`Action: ${ACTION}`)

  switch (ACTION) {
    case 'start_round2': await manualStartRound2(); break
    case 'end_round2':   await manualEndRound2(); break
    case 'start_yearly': await manualStartYearly(); break
    case 'end_yearly':   await manualEndYearly(); break
    default:             await runAuto(); break
  }
}

main().catch((err) => { console.error(err); process.exit(1) })


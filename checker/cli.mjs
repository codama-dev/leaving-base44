#!/usr/bin/env node
// Base44 export checker, command-line version.
//
//   node checker/cli.mjs path/to/export.zip
//   node checker/cli.mjs path/to/synced-folder
//   node checker/cli.mjs path/to/export.zip --json
//
// Reads the ZIP from Base44's Code tab, a GitHub-synced folder, or a CLI checkout, and lists what the
// app still needs Base44's servers for. Everything happens on your machine: no network calls, no
// dependencies beyond Node.js 18 or later.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { checkFiles } from './core.mjs'

const WANTED = /\.(m?[jt]sx?|jsonc?)$/i
const SKIP = new Set(['node_modules', '.git', 'dist'])
const MAX_FILE = 2_000_000
const MAX_FILES = 6000

/** The text files of a ZIP, read from its central directory. */
export function readZip(buf) {
	let eocd = -1
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i
			break
		}
	}
	if (eocd < 0) throw new Error('Not a ZIP file.')
	const entries = buf.readUInt16LE(eocd + 10)
	let p = buf.readUInt32LE(eocd + 16)
	const out = []
	for (let n = 0; n < entries && out.length < MAX_FILES; n++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) break
		const method = buf.readUInt16LE(p + 10)
		const size = buf.readUInt32LE(p + 20)
		const usize = buf.readUInt32LE(p + 24)
		const nameLen = buf.readUInt16LE(p + 28)
		const extraLen = buf.readUInt16LE(p + 30)
		const commentLen = buf.readUInt16LE(p + 32)
		const local = buf.readUInt32LE(p + 42)
		const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
		p += 46 + nameLen + extraLen + commentLen
		if (name.endsWith('/') || !WANTED.test(name) || usize > MAX_FILE) continue
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
		const raw = buf.subarray(start, start + size)
		let bytes
		if (method === 0) bytes = raw
		else if (method === 8) bytes = inflateRawSync(raw)
		else continue
		out.push({ path: name, text: bytes.toString('utf8') })
	}
	return out
}

export function readFolder(dir) {
	const out = []
	const walk = d => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			if (SKIP.has(e.name) || out.length >= MAX_FILES) continue
			const p = join(d, e.name)
			if (e.isDirectory()) walk(p)
			else if (WANTED.test(e.name) && statSync(p).size <= MAX_FILE) out.push({ path: relative(dir, p), text: readFileSync(p, 'utf8') })
		}
	}
	walk(dir)
	return out
}

export function report(r) {
	if (!r.isBase44) return "This doesn't look like a Base44 project (no @base44/sdk, no base44/ folder, no SDK calls)."
	const lines = [`Read ${r.fileCount} files, ${r.codeFiles} of them code.`]
	if (r.sdk) lines.push(`Base44 SDK: ${r.sdk}`)
	if (r.legacyImports) lines.push('Uses the older import style (@/entities, @/integrations).')
	lines.push('', 'Still runs on Base44:')
	const item = (title, detail) => lines.push(`  - ${title}${detail ? `: ${detail}` : ''}`)
	const list = (xs, max = 12) => (xs.length > max ? `${xs.slice(0, max).join(', ')} … (+${xs.length - max})` : xs.join(', '))
	let shown = 0
	const add = (title, detail) => {
		item(title, detail)
		shown++
	}
	if (r.tables.length) add(`Data tables (${r.tables.length})`, `${list(r.tables)}. Records and access rules live in Base44's database.`)
	if (r.signIn.used)
		add('Users and sign-in', `Base44 holds the accounts and password hashes${r.signIn.providers.length ? `; providers in the code: ${r.signIn.providers.join(', ')}` : ''}.`)
	if (r.functions.length || r.invoked.length)
		add(`Backend functions (${r.functions.length || r.invoked.length})`, "run on Base44's function runtime.")
	if (r.missingFunctions.length)
		item('Missing functions', `the code calls functions that aren't in this export: ${list(r.missingFunctions, 8)}. They may have been deleted on Base44; those calls fail there too.`)
	if (r.integrations.ai) add('AI', `${r.integrations.ai.join(', ')}, billed as Base44 integration credits.`)
	if (r.integrations.email) add('Sending email', 'sent by Base44.')
	if (r.integrations.sms) add('Text messages', 'sent through Base44.')
	if (r.integrations.files) add('Files', `${r.integrations.files.join(', ')}, stored in Base44's storage.`)
	if (r.realtime) add('Live updates', "Base44's realtime subscriptions.")
	if (r.agents.length) add(`AI agents (${r.agents.length})`, list(r.agents))
	if (r.connectors) add('Connectors', 'OAuth tokens for Gmail, Slack and others are held by Base44.')
	if (r.workflows) add(`Workflows (${r.workflows})`, "run by Base44's scheduler.")
	if (!shown) lines.push("  (nothing found; if this is the right export, the code may call the SDK in a way the checker doesn't recognise)")
	if (r.notYet.length) lines.push('', `Uses ${r.notYet.join(', ')}.`)
	lines.push(
		'',
		"Not in any export, so not counted here: your records, users and passwords, secret values, uploaded files and automations. They stay on Base44 until you move them. See the README for how.",
	)
	return lines.join('\n')
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cli.mjs')
if (isMain) {
	const args = process.argv.slice(2)
	const target = args.find(a => !a.startsWith('--'))
	if (!target) {
		console.error('Usage: node checker/cli.mjs <export.zip | folder> [--json]')
		process.exit(2)
	}
	try {
		const files = statSync(target).isDirectory() ? readFolder(target) : readZip(readFileSync(target))
		const result = checkFiles(files)
		console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : report(result))
		process.exit(result.isBase44 ? 0 : 1)
	} catch (err) {
		console.error(err.message || String(err))
		process.exit(2)
	}
}

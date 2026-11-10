import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readFolder, readZip, report } from '../checker/cli.mjs'
import { checkFiles } from '../checker/core.mjs'

const fixture = fileURLToPath(new URL('./fixture-app', import.meta.url))

/** A stored (uncompressed) ZIP of a folder, so the test needs no zip tool. */
function zipFolder(dir, prefix) {
	const files = []
	const walk = d => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const p = join(d, e.name)
			if (e.isDirectory()) walk(p)
			else files.push({ name: `${prefix}/${relative(dir, p)}`, data: readFileSync(p) })
		}
	}
	walk(dir)
	const locals = []
	const centrals = []
	let offset = 0
	for (const f of files) {
		const name = Buffer.from(f.name)
		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt32LE(f.data.length, 18)
		local.writeUInt32LE(f.data.length, 22)
		local.writeUInt16LE(name.length, 26)
		const central = Buffer.alloc(46)
		central.writeUInt32LE(0x02014b50, 0)
		central.writeUInt32LE(f.data.length, 20)
		central.writeUInt32LE(f.data.length, 24)
		central.writeUInt16LE(name.length, 28)
		central.writeUInt32LE(offset, 42)
		locals.push(local, name, f.data)
		centrals.push(central, name)
		offset += 30 + name.length + f.data.length
	}
	const cd = Buffer.concat(centrals)
	const end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50, 0)
	end.writeUInt16LE(files.length, 8)
	end.writeUInt16LE(files.length, 10)
	end.writeUInt32LE(cd.length, 12)
	end.writeUInt32LE(offset, 16)
	return Buffer.concat([...locals, cd, end])
}

function expectFixture(r) {
	assert.equal(r.isBase44, true)
	assert.equal(r.sdk, '^0.8.0')
	assert.deepEqual(r.tables, ['Customer', 'Order'])
	assert.deepEqual(r.functions, ['sendReceipt'])
	assert.deepEqual(r.missingFunctions, ['deletedLongAgo'])
	assert.equal(r.signIn.used, true)
	assert.deepEqual(r.signIn.providers, ['google'])
	assert.deepEqual(r.integrations.ai, ['InvokeLLM'])
	assert.deepEqual(r.integrations.email, ['SendEmail'])
	assert.deepEqual(r.integrations.files, ['UploadFile'])
}

test('reads a synced folder', () => {
	expectFixture(checkFiles(readFolder(fixture)))
})

test('reads a Code-tab ZIP, dropping the folder the ZIP adds', () => {
	expectFixture(checkFiles(readZip(zipFolder(fixture, 'fixture-app'))))
})

test('the report names what still runs on Base44', () => {
	const text = report(checkFiles(readFolder(fixture)))
	assert.match(text, /Data tables \(2\)/)
	assert.match(text, /Missing functions: the code calls functions that aren't in this export: deletedLongAgo/)
	assert.doesNotMatch(text, /—/)
})

test('says so when the folder is not a Base44 project', () => {
	const r = checkFiles([{ path: 'package.json', text: '{"dependencies":{"react":"18"}}' }, { path: 'src/a.js', text: 'export const a = 1' }])
	assert.equal(r.isBase44, false)
	assert.match(report(r), /doesn't look like a Base44 project/)
})

test('rejects a file that is not a ZIP', () => {
	assert.throws(() => readZip(Buffer.from('not a zip at all, just some text padding it out')), /Not a ZIP/)
})

// Base44 export checker: the part that reads files. Runs in the browser (and in Node for tests): given
// the files of a Base44 project (the Code-tab ZIP, a GitHub-synced folder, or a CLI checkout), it lists
// what still runs on Base44's servers. Nothing leaves the visitor's computer.
//
// checkFiles([{ path, text }]) → { sdk, tables, functions, invoked, integrations, ... }

const CODE = /\.(m?[jt]sx?)$/i

const INTEGRATIONS = {
	InvokeLLM: 'ai',
	GenerateImage: 'ai',
	ExtractDataFromUploadedFile: 'ai',
	GenerateSpeech: 'ai',
	TranscribeAudio: 'ai',
	GenerateVideo: 'ai',
	SendEmail: 'email',
	SendSMS: 'sms',
	UploadFile: 'files',
	UploadPrivateFile: 'files',
	CreateFileSignedUrl: 'files',
}

/** Base44 integrations worth flagging separately: few replacements exist for them yet. */
const NOT_YET = ['Generate3DAsset']

const unique = arr => [...new Set(arr)].sort((a, b) => a.localeCompare(b))

function stripJsonc(text) {
	return text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Drops the folder the ZIP or the picked directory adds in front of every path. */
function normalise(files) {
	const paths = files.map(f => f.path.replace(/\\/g, '/').replace(/^\.\//, ''))
	const firsts = new Set(paths.map(p => p.split('/')[0]))
	const prefix =
		firsts.size === 1 && paths.every(p => p.includes('/')) && !paths.some(p => p.startsWith('src/') || p.startsWith('base44/'))
			? `${[...firsts][0]}/`
			: ''
	return files
		.map((f, i) => ({ path: prefix ? paths[i].slice(prefix.length) : paths[i], text: f.text }))
		.filter(f => !f.path.split('/').some(part => part === 'node_modules' || part === '.git' || part === 'dist'))
}

export function checkFiles(input) {
	const files = normalise(input)
	const code = files.filter(f => CODE.test(f.path))
	const all = code.map(f => f.text).join('\n')
	const count = re => (all.match(re) || []).length

	// The SDK version the app is built against.
	let sdk = null
	const pkg = files.find(f => f.path === 'package.json')
	if (pkg) {
		try {
			const json = JSON.parse(pkg.text)
			sdk = json.dependencies?.['@base44/sdk'] ?? json.devDependencies?.['@base44/sdk'] ?? null
		} catch {
			/* not JSON */
		}
	}
	const isBase44 =
		!!sdk || /@base44\/sdk|base44Client|createClient\(\s*\{\s*appId/.test(all) || files.some(f => f.path.startsWith('base44/'))

	// Tables: defined in base44/entities (or src/entities in older exports), used in code.
	const defined = files
		.filter(f => /^(base44|src)\/entities\/[^/]+\.jsonc?$/i.test(f.path))
		.map(f => {
			try {
				return JSON.parse(stripJsonc(f.text)).name ?? f.path.split('/').pop().replace(/\.jsonc?$/i, '')
			} catch {
				return f.path.split('/').pop().replace(/\.jsonc?$/i, '')
			}
		})
	const used = [
		...[...all.matchAll(/\bentities\.([A-Z][A-Za-z0-9_]*)\b/g)].map(m => m[1]),
		...[...all.matchAll(/from\s+['"]@\/entities\/([A-Za-z0-9_]+)['"]/g)].map(m => m[1]),
		...[...all.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]@\/(?:api\/)?entities['"]/g)].flatMap(m =>
			m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean),
		),
	]
	const tables = unique([...defined, ...used.filter(n => n !== 'User')])

	// Backend functions: folders in base44/functions (or functions/), and the names the code calls.
	const functions = unique(
		files
			.map(f => f.path.match(/^(?:base44\/)?functions\/([^/]+)\/(?:entry|index)\.[jt]sx?$/i)?.[1])
			.filter(Boolean),
	)
	const invoked = unique([
		...[...all.matchAll(/functions\.invoke\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]),
		...[...all.matchAll(/from\s+['"]@\/functions\/([A-Za-z0-9_]+)['"]/g)].map(m => m[1]),
	])

	// Built-in integrations, by kind.
	const integrations = {}
	for (const [name, kind] of Object.entries(INTEGRATIONS)) {
		const n = count(new RegExp(`\\b${name}\\b`, 'g'))
		if (n) integrations[kind] = unique([...(integrations[kind] ?? []), name])
	}
	const notYet = NOT_YET.filter(name => new RegExp(`\\bCore\\.${name}\\b`).test(all))

	// Automations live on Base44's side (they aren't in the export), so they can't be counted here.
	const workflows = files.filter(f => /^base44\/workflows\/[^/]+\.jsonc?$/i.test(f.path)).length
	const agents = unique(
		files.map(f => f.path.match(/^base44\/agents\/([^/]+)\.jsonc?$/i)?.[1]).filter(Boolean),
	)

	return {
		isBase44,
		sdk,
		legacyImports: /from\s+['"]@\/(entities|integrations|functions|agents)\b/.test(all),
		fileCount: files.length,
		codeFiles: code.length,
		tables,
		functions,
		invoked,
		missingFunctions: invoked.filter(n => functions.length && !functions.includes(n)),
		signIn: {
			used: count(/\bauth\.(me|login|logout|loginWithProvider|redirectToLogin|updateMe|isAuthenticated)\b/g) > 0,
			providers: unique([...all.matchAll(/loginWithProvider\(\s*['"`]([a-z]+)['"`]/g)].map(m => m[1])),
		},
		integrations,
		notYet,
		realtime: count(/\.subscribe\(/g) > 0,
		agents: unique([...agents, ...(count(/\bagents\.(createConversation|addMessage|subscribeToConversation)\b/g) && !agents.length ? ['(used in code)'] : [])]),
		connectors: count(/\bconnectors\.(getAccessToken|getConnection|callApi|getCurrentAppUser|connectAppUser)/g) > 0,
		workflows,
	}
}

import { createClientFromRequest } from 'npm:@base44/sdk'
Deno.serve(async req => {
  const base44 = createClientFromRequest(req)
  await base44.integrations.Core.SendEmail({ to: 'a@example.com', subject: 'Receipt', body: 'Thanks' })
  return Response.json({ ok: true })
})

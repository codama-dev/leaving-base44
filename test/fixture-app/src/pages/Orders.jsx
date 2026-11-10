import { base44 } from '@/api/base44Client'
export default async function Orders() {
  const me = await base44.auth.me()
  const orders = await base44.entities.Order.list()
  await base44.functions.invoke('sendReceipt', { id: orders[0].id })
  await base44.functions.invoke('deletedLongAgo', {})
  await base44.integrations.Core.InvokeLLM({ prompt: 'Summarise' })
  await base44.integrations.Core.UploadFile({ file: null })
  base44.auth.loginWithProvider('google')
  return { me, orders }
}

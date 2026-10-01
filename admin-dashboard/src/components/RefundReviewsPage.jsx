import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import { Button, EmptyState, Field, Toast, useToast } from './ui'

export default function RefundReviewsPage() {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState('')
  const [notes, setNotes] = useState({})
  const { toast, notify } = useToast()

  useEffect(() => {
    const reviews = query(collection(db, 'orders'), where('refund_review_required', '==', true))
    return onSnapshot(reviews, snapshot => {
      setItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.failed_at?.seconds || 0) - (a.failed_at?.seconds || 0)))
    }, error => notify(`تعذر تحميل طابور الاسترجاع: ${error.code || error.message}`, 'error'))
  }, [notify])

  const resolve = async (orderId, decision) => {
    setBusy(`${orderId}:${decision}`)
    try {
      await httpsCallable(functions, 'resolveRefundReview')({ order_id: orderId, decision, note: notes[orderId] || '' })
      notify(decision === 'refund' ? 'تم اعتماد الاسترجاع' : 'تم رفض الاسترجاع')
    } catch (error) {
      notify(error.message || 'تعذر حسم طلب الاسترجاع', 'error')
    } finally {
      setBusy('')
    }
  }

  return <>
    <section className="page-heading">
      <div><p className="eyebrow">FINANCE / REFUND REVIEW</p><h1>طابور مراجعة الاسترجاع</h1><p>راجع الطلبات التي تعذر تسليمها بسبب العميل واتخذ قرارًا نهائيًا.</p></div>
    </section>
    <section className="data-card">
      <table><thead><tr><th>الطلب</th><th>الحالة</th><th>سبب الفشل</th><th>العميل</th><th>المبلغ</th><th>ملاحظة القرار</th><th>الإجراء</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td><strong>#{item.id.slice(0, 8)}</strong><small>{item.vendor_id || '—'}</small></td>
          <td><span className="badge blue">{item.status}</span></td>
          <td>{item.failure_reason || '—'}</td>
          <td>{item.customer_id || '—'}</td>
          <td>{Number(item.wallet_amount || 0)} ل.س + {Number(item.loyalty_points_used || 0)} نقطة</td>
          <td><Field label="" value={notes[item.id] || ''} placeholder="اختياري" onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} /></td>
          <td><div className="table-actions"><Button busy={busy === `${item.id}:refund`} onClick={() => resolve(item.id, 'refund')}>استرجاع</Button><Button variant="secondary" busy={busy === `${item.id}:deny`} onClick={() => resolve(item.id, 'deny')}>رفض</Button></div></td>
        </tr>)}</tbody>
      </table>
      {!items.length && <EmptyState>لا توجد طلبات بانتظار مراجعة الاسترجاع.</EmptyState>}
    </section>
    <Toast toast={toast} />
  </>
}

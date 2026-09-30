import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import { Button, EmptyState, Field, Toast, useToast } from './ui'

const money = value => `${Number(value || 0).toLocaleString('ar-SY')} ل.س`
const statusLabel = { pending: 'بانتظار المراجعة', approved: 'معتمد', rejected: 'مرفوض' }

export default function ChangeRequestsPage() {
  const [pending, setPending] = useState([])
  const [reviewed, setReviewed] = useState([])
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState('')
  const { toast, notify } = useToast()
  const items = useMemo(() => {
    const byId = new Map()
    pending.forEach(item => byId.set(item.id, item))
    reviewed.forEach(item => byId.set(item.id, item))
    return [...byId.values()].sort((a, b) => {
      const pendingFirst = Number(b.status === 'pending') - Number(a.status === 'pending')
      if (pendingFirst) return pendingFirst
      return (b.reviewed_at?.seconds || b.requested_at?.seconds || 0) - (a.reviewed_at?.seconds || a.requested_at?.seconds || 0)
    })
  }, [pending, reviewed])

  useEffect(() => {
    const pendingQuery = query(collection(db, 'change_requests'), where('status', '==', 'pending'), orderBy('requested_at', 'desc'), limit(100))
    const reviewedQuery = query(collection(db, 'change_requests'), where('status', 'in', ['approved', 'rejected']), orderBy('reviewed_at', 'desc'), limit(50))
    const unsubscribePending = onSnapshot(pendingQuery, snapshot => setPending(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), () => notify('تعذر تحميل الطلبات المعلقة', 'error'))
    const unsubscribeReviewed = onSnapshot(reviewedQuery, snapshot => setReviewed(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), () => notify('تعذر تحميل سجل طلبات الفكة', 'error'))
    return () => { unsubscribePending(); unsubscribeReviewed() }
  }, [notify])

  const review = async (item, decision) => {
    const note = String(notes[item.id] || '').trim()
    if (decision === 'approve' && item.needs_manual_review === true && !note) {
      notify('أضف ملاحظة قبل اعتماد طلب الفكة الكبير', 'error')
      return
    }
    if (decision === 'approve') {
      const confirmed = window.confirm(`تأكيد اعتماد ${money(item.amount)} للزبون ${item.customer_id || '—'} مع تسجيل التزام على المندوب ${item.courier_id || '—'}؟`)
      if (!confirmed) return
    }
    setBusy(`${item.id}:${decision}`)
    try {
      await httpsCallable(functions, 'reviewChangeRequest')({ order_id: item.id, decision, note })
      notify(decision === 'approve' ? 'تم اعتماد طلب الفكة' : 'تم رفض طلب الفكة')
    } catch (error) {
      notify(error.message || 'تعذر مراجعة طلب الفكة', 'error')
    } finally {
      setBusy('')
    }
  }

  return <>
    <section className="page-heading">
      <div><p className="eyebrow">FINANCE / CHANGE REQUESTS</p><h1>طلبات تحويل الفكة</h1><p>المعلّق: {pending.length} · السجل المعروض: {reviewed.length} طلبًا</p></div>
    </section>
    <section className="data-card">
      <table>
        <thead><tr><th>الطلب والأطراف</th><th>الحساب المالي</th><th>الحالة</th><th>التدقيق</th><th>الإجراء</th></tr></thead>
        <tbody>{items.map(item => {
          const claimed = Number(item.courier_claimed_amount)
          const calculated = Number(item.amount || 0)
          const claimedDiffers = Number.isFinite(claimed) && Math.abs(claimed - calculated) > 0.01
          return <tr key={item.id}>
            <td><strong>#{item.id.slice(0, 8)}</strong><br /><small>الزبون: {item.customer_id || '—'}<br />المندوب: {item.courier_id || '—'}</small></td>
            <td>{money(item.amount)}<br /><small>دفع الزبون بـ: {money(item.cash_change_for)} / المستحق: {money(item.cash_due)}<br />ادعاء المندوب: {Number.isFinite(claimed) ? money(claimed) : '—'}</small></td>
            <td><span className={`badge ${item.status === 'approved' ? 'green' : item.status === 'rejected' ? 'muted' : 'blue'}`}>{statusLabel[item.status] || item.status}</span></td>
            <td>{item.needs_manual_review === true ? <span className="badge" title="يتطلب ملاحظة عند الاعتماد">مراجعة يدوية</span> : 'عادي'}{claimedDiffers && <><br /><span className="badge" title="القيمة المدعاة تختلف عن الحساب الخادمي">فرق في الادعاء</span></>}</td>
            <td>{item.status !== 'pending' ? <small>{item.review_note || 'تمت المراجعة'}</small> : <div className="form-grid">
              <Field label="ملاحظة الأدمن" value={notes[item.id] || ''} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} />
              <div className="modal-actions"><Button busy={busy === `${item.id}:approve`} onClick={() => review(item, 'approve')}>اعتماد</Button><Button variant="secondary" busy={busy === `${item.id}:reject`} onClick={() => review(item, 'reject')}>رفض</Button></div>
            </div>}</td>
          </tr>
        })}</tbody>
      </table>
      {!items.length && <EmptyState>لا توجد طلبات فكة.</EmptyState>}
    </section>
    <Toast toast={toast} />
  </>
}

import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import { Button, EmptyState, Field, Toast, useToast } from './ui'

const money = value => `${Number(value || 0).toLocaleString('ar-SY')} ل.س`

export default function ChangeRequestsPage() {
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState('')
  const { toast, notify } = useToast()

  useEffect(() => onSnapshot(
    collection(db, 'change_requests'),
    snapshot => setItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.requested_at?.seconds || 0) - (a.requested_at?.seconds || 0))),
    () => notify('تعذر تحميل طلبات تحويل الفكة', 'error'),
  ), [notify])

  const review = async (item, decision) => {
    const note = String(notes[item.id] || '').trim()
    if (decision === 'approve' && item.needs_manual_review === true && !note) {
      notify('أضف ملاحظة قبل اعتماد طلب الفكة الكبير', 'error')
      return
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
      <div><p className="eyebrow">FINANCE / CHANGE REQUESTS</p><h1>طلبات تحويل الفكة</h1><p>راجع طلبات الفكة قبل إضافة رصيد للزبون وتسجيل التزام المندوب.</p></div>
    </section>
    <section className="data-card">
      <table>
        <thead><tr><th>الطلب</th><th>المبلغ</th><th>المندوب</th><th>الحالة</th><th>المراجعة</th><th>الإجراء</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td><strong>#{item.id.slice(0, 8)}</strong><br /><small>{item.customer_id || '—'}</small></td>
          <td>{money(item.amount)}<br /><small>المبلغ المطلوب: {money(item.cash_change_for)} / المستحق: {money(item.cash_due)}</small></td>
          <td>{item.courier_id || '—'}</td>
          <td><span className={`badge ${item.status === 'approved' ? 'green' : item.status === 'rejected' ? 'muted' : 'blue'}`}>{item.status}</span></td>
          <td>{item.needs_manual_review === true ? <span className="badge" title="يتطلب ملاحظة عند الاعتماد">مراجعة يدوية</span> : 'عادي'}</td>
          <td>{item.status !== 'pending' ? <small>{item.review_note || 'تمت المراجعة'}</small> : <div className="form-grid">
            <Field label="ملاحظة الأدمن" value={notes[item.id] || ''} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} />
            <div className="modal-actions"><Button busy={busy === `${item.id}:approve`} onClick={() => review(item, 'approve')}>اعتماد</Button><Button variant="secondary" busy={busy === `${item.id}:reject`} onClick={() => review(item, 'reject')}>رفض</Button></div>
          </div>}</td>
        </tr>)}</tbody>
      </table>
      {!items.length && <EmptyState>لا توجد طلبات فكة.</EmptyState>}
    </section>
    <Toast toast={toast} />
  </>
}

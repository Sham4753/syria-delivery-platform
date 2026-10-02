import { useEffect, useState } from 'react'
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db, functions } from '../firebase'
import { httpsCallable } from 'firebase/functions'
import { Button, EmptyState, Field, Toast, useToast } from './ui'
import { uploadOptimizedImage } from '../assetUtils'

const defaults = {
  app_name: 'Syria Delivery', currency: 'SYP', support_phone: '', default_delivery_fee: 100,
  pricing_tiers: [{ from_km: 0, to_km: 3, fee: 100 }, { from_km: 3, to_km: 8, fee: 150 }],
  commission_by_zone: {}, banners: [], categories: [], home_sections: ['categories', 'featured_vendors', 'nearby_vendors'],
  featured_vendor_ids: [], free_delivery_vendor_ids: [], surge_enabled: false, surge_multiplier: 1,
  batching_enabled: false, max_batch_orders: 2, loyalty_points_rate: 0, loyalty_points_divisor: 10, loyalty_point_value: 0,
  courier_min_withdrawal: 0, merchant_min_withdrawal: 0, low_bandwidth_mode: false,
  min_order_amount: 0, primary_color: '#0f766e', secondary_color: '#f59e0b',
  enable_google_auth: true, enable_facebook_auth: false, enable_whatsapp_otp: false, enable_guest_shopping: true,
  app_logo_url: '',
}

const providerDefaults = { provider_id: 'none', environment: 'sandbox', enabled: false, currency: 'SYP' }

const paymentDefaults = {
  bank_transfer: {
    enabled: false, requires_manual_review: true, display_name_ar: 'تحويل بنكي', bank_name: '',
    account_holder: '', account_number_masked: '', currency: 'SYP', instructions_ar: '',
  },
}

const pickConfig = data => Object.fromEntries(Object.keys(defaults).map(key => [key, data?.[key] ?? defaults[key]]))

const linesToCategories = value => value.split('\n').map(line => {
  const [id, name, icon] = line.split('|').map(x => x.trim())
  return id && name ? { id, name, icon: icon || 'category' } : null
}).filter(Boolean)

export default function MasterSettingsPage() {
  const [config, setConfig] = useState(defaults)
  const [paymentSettings, setPaymentSettings] = useState(paymentDefaults)
  const [providerSettings, setProviderSettings] = useState(providerDefaults)
  const [broadcast, setBroadcast] = useState({ title: '', body: '', target_role: 'customer' })
  const [vendors, setVendors] = useState([])
  const [logs, setLogs] = useState([])
  const [busy, setBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const { toast, notify } = useToast()

  useEffect(() => {
    let active = true
    Promise.race([getDoc(doc(db, 'system_config', 'main')), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))])
      .then(s => active && s.exists() && setConfig(pickConfig(s.data())))
      .catch(() => active && notify('تعذر تحميل الإعدادات، يمكنك تعديلها وحفظها', 'error'))
    return () => { active = false }
  }, [notify])
  useEffect(() => {
    let active = true
    getDoc(doc(db, 'payment_config', 'main')).then(s => active && s.exists() && setPaymentSettings(current => ({ bank_transfer: { ...current.bank_transfer, ...(s.data()?.bank_transfer || {}) } }))).catch(() => {})
    return () => { active = false }
  }, [])
  useEffect(() => { let active = true; getDoc(doc(db, 'payment_provider_config', 'main')).then(s => active && s.exists() && setProviderSettings(current => ({ ...current, ...s.data() }))).catch(() => {}); return () => { active = false } }, [])
  useEffect(() => { const unsubscribe = onSnapshot(collection(db, 'vendors'), s => setVendors(s.docs.map(d => ({ id: d.id, ...d.data() })))); return unsubscribe }, [])
  useEffect(() => { const unsubscribe = onSnapshot(collection(db, 'audit_logs'), s => setLogs(s.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 40))); return unsubscribe }, [])

  const save = async event => {
    event.preventDefault(); setBusy(true)
    try {
      const result = await httpsCallable(functions, 'publishSystemConfig')({ patch: pickConfig(config), reason: 'master_settings' })
      notify(`تم نشر الإعدادات وتسجيل الإصدار ${result.data.version}`)
    } catch (error) { notify(error.message || 'فشل حفظ الإعدادات', 'error') } finally { setBusy(false) }
  }
  const saveProvider = async () => {
    setBusy(true)
    try { const result = await httpsCallable(functions, 'publishPaymentProviderSettings')({ settings: providerSettings }); notify(`تم نشر إعداد المزود، الإصدار ${result.data.version}`) }
    catch (error) { notify(error.message || 'فشل حفظ إعداد المزود', 'error') } finally { setBusy(false) }
  }
  const savePayment = async () => {
    setBusy(true)
    try {
      const result = await httpsCallable(functions, 'publishPaymentSettings')({ settings: paymentSettings, reason: 'payment_settings' })
      notify(`تم نشر إعدادات الدفع الآمنة، الإصدار ${result.data.version}`)
    } catch (error) { notify(error.message || 'فشل حفظ إعدادات الدفع', 'error') } finally { setBusy(false) }
  }
  const sendBroadcast = async () => {
    setBusy(true)
    try { const result = await httpsCallable(functions, 'sendBroadcastNotification')(broadcast); notify(`تم إرسال الإشعار إلى ${result.data.sent} جهاز`); setBroadcast({ title: '', body: '', target_role: 'customer' }) }
    catch (error) { notify(error.message || 'تعذر إرسال الإشعار', 'error') } finally { setBusy(false) }
  }
  const update = (key, value) => setConfig(c => ({ ...c, [key]: value }))
  const addTier = () => update('pricing_tiers', [...(config.pricing_tiers || []), { from_km: 0, to_km: 0, fee: 0 }])
  const addBanner = () => update('banners', [...(config.banners || []), { title: '', image_url: '', action: '', is_active: true }])
  const uploadAsset = async (event, key, folder) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadBusy(true)
    try { const result = await uploadOptimizedImage(file, folder); if (key.startsWith('banner_')) { const index = Number(key.split('_')[1]); update('banners', config.banners.map((banner, i) => i === index ? { ...banner, image_url: result.url } : banner)) } else update(key, result.url); notify(`تم ضغط ورفع الصورة (${Math.round(result.bytes / 1024)}KB)`); event.target.value = '' }
    catch (error) { notify(error.message || 'تعذر ضغط ورفع الصورة', 'error') }
    finally { setUploadBusy(false) }
  }

  return <>
    <section className="page-heading"><div><p className="eyebrow">SYSTEM / MASTER CONFIGURATION</p><h1>مركز التحكم المركزي</h1><p>الأسعار، التسويق، الأمان، والإعدادات التشغيلية.</p></div></section>
    <form className="settings-form" onSubmit={save}>
      <section className="data-card settings-card"><h2>التشغيل والتسعير</h2><div className="form-grid">
        <Field label="اسم التطبيق" value={config.app_name || ''} onChange={e => update('app_name', e.target.value)} />
        <Field label="هاتف الدعم" value={config.support_phone || ''} onChange={e => update('support_phone', e.target.value)} />
        <Field label="رسم التوصيل الافتراضي" type="number" value={config.default_delivery_fee || 0} onChange={e => update('default_delivery_fee', Number(e.target.value))} />
        <Field label="مضاعف الازدحام" type="number" min="0.1" value={config.surge_multiplier || 1} onChange={e => update('surge_multiplier', Number(e.target.value))} />
        <label className="check-field"><input type="checkbox" checked={config.surge_enabled === true} onChange={e => update('surge_enabled', e.target.checked)} /> تفعيل الازدحام</label>
        <label className="check-field"><input type="checkbox" checked={config.low_bandwidth_mode === true} onChange={e => update('low_bandwidth_mode', e.target.checked)} /> وضع البيانات المنخفضة</label>
        <label className="check-field"><input type="checkbox" checked={config.batching_enabled === true} onChange={e => update('batching_enabled', e.target.checked)} /> السماح بالتجميع</label>
        <Field label="أقصى عدد للطلب المجمع" type="number" min="2" max="3" value={config.max_batch_orders || 2} onChange={e => update('max_batch_orders', Number(e.target.value))} />
        <Field label="معدل النقاط" type="number" min="0" value={config.loyalty_points_rate || 0} onChange={e => update('loyalty_points_rate', Number(e.target.value))} />
        <Field label="كل كم ليرة = نقاط الولاء" type="number" min="1" max="1000000" value={config.loyalty_points_divisor || 10} onChange={e => update('loyalty_points_divisor', Number(e.target.value))} />
        <small className="map-help">مثال: طلب بـ 250 ل.س يمنح {Math.floor(250 / Math.max(1, Number(config.loyalty_points_divisor || 10)) * Number(config.loyalty_points_rate || 0))} نقطة</small>
        <Field label="قيمة النقطة" type="number" min="0" value={config.loyalty_point_value || 0} onChange={e => update('loyalty_point_value', Number(e.target.value))} />
        <Field label="حد سحب المندوب" type="number" min="0" value={config.courier_min_withdrawal || 0} onChange={e => update('courier_min_withdrawal', Number(e.target.value))} />
        <Field label="حد سحب التاجر" type="number" min="0" value={config.merchant_min_withdrawal || 0} onChange={e => update('merchant_min_withdrawal', Number(e.target.value))} />
        <Field label="الحد الأدنى للطلب" type="number" min="0" value={config.min_order_amount || 0} onChange={e => update('min_order_amount', Number(e.target.value))} />
      </div></section>
      <section className="data-card settings-card"><h2>الهوية والأصول منخفضة البيانات</h2><div className="form-grid"><Field label="اللون الأساسي" type="color" value={config.primary_color || '#0f766e'} onChange={e => update('primary_color', e.target.value)} /><Field label="اللون الثانوي" type="color" value={config.secondary_color || '#f59e0b'} onChange={e => update('secondary_color', e.target.value)} /><Field label="رابط شعار التطبيق" value={config.app_logo_url || ''} onChange={e => update('app_logo_url', e.target.value)} /><label className="field"><span>رفع شعار / WebP أقل من 150KB</span><input type="file" accept="image/*" disabled={uploadBusy} onChange={e => uploadAsset(e, 'app_logo_url', 'branding')} /></label></div></section>
      <section className="data-card settings-card"><h2>التصنيفات الديناميكية</h2><Field label="المعرّف | الاسم | الأيقونة، تصنيف في كل سطر" value={(config.categories || []).map(c => `${c.id}|${c.name}|${c.icon || ''}`).join('\n')} onChange={e => update('categories', linesToCategories(e.target.value))} /></section>
      <section className="data-card settings-card"><div className="section-heading"><h2>شرائح رسوم التوصيل</h2><Button type="button" variant="secondary" onClick={addTier}>+ شريحة</Button></div>{(config.pricing_tiers || []).map((tier, index) => <div className="form-grid" key={index}><Field label="من كم" type="number" min="0" value={tier.from_km || 0} onChange={e => update('pricing_tiers', config.pricing_tiers.map((item, i) => i === index ? { ...item, from_km: Number(e.target.value) } : item))} /><Field label="إلى كم" type="number" min="0" value={tier.to_km || 0} onChange={e => update('pricing_tiers', config.pricing_tiers.map((item, i) => i === index ? { ...item, to_km: Number(e.target.value) } : item))} /><Field label="الرسم" type="number" min="0" value={tier.fee || 0} onChange={e => update('pricing_tiers', config.pricing_tiers.map((item, i) => i === index ? { ...item, fee: Number(e.target.value) } : item))} /></div>)}</section>
      <section className="data-card settings-card"><h2>خيارات الدخول والشراء</h2><div className="form-grid"><label className="check-field"><input type="checkbox" checked={config.enable_google_auth !== false} onChange={e => update('enable_google_auth', e.target.checked)} /> دخول Google</label><label className="check-field"><input type="checkbox" checked={config.enable_facebook_auth === true} onChange={e => update('enable_facebook_auth', e.target.checked)} /> دخول Facebook</label><label className="check-field"><input type="checkbox" checked={config.enable_whatsapp_otp === true} onChange={e => update('enable_whatsapp_otp', e.target.checked)} /> WhatsApp / OTP</label><label className="check-field"><input type="checkbox" checked={config.enable_guest_shopping !== false} onChange={e => update('enable_guest_shopping', e.target.checked)} /> التسوق كزائر</label></div></section>
      <section className="data-card settings-card"><h2>إعدادات الدفع والتحويل البنكي</h2><p className="map-help">هذه الشاشة تحفظ بيانات العرض فقط. لا تحفظ مفاتيح API أو كلمات المرور أو رقم حساب كامل. الربط البنكي الفعلي يحتاج مزودًا رسميًا وSecret Manager.</p><div className="form-grid"><label className="check-field"><input type="checkbox" checked={paymentSettings.bank_transfer.enabled === true} onChange={e => setPaymentSettings(s => ({ ...s, bank_transfer: { ...s.bank_transfer, enabled: e.target.checked } }))} /> تفعيل التحويل البنكي</label><label className="check-field"><input type="checkbox" checked={paymentSettings.bank_transfer.requires_manual_review !== false} onChange={e => setPaymentSettings(s => ({ ...s, bank_transfer: { ...s.bank_transfer, requires_manual_review: e.target.checked } }))} /> مراجعة يدوية إلزامية</label><Field label="اسم طريقة الدفع" value={paymentSettings.bank_transfer.display_name_ar || ''} onChange={e => setPaymentSettings(s => ({ ...s, bank_transfer: { ...s.bank_transfer, display_name_ar: e.target.value } }))} /><Field label="اسم البنك" value={paymentSettings.bank_transfer.bank_name || ''} onChange={e => setPaymentSettings(s => ({ ...s, bank_transfer: { ...s.bank_transfer, bank_name: e.target.value } }))} /><Field label="اسم صاحب الحساب" value={paymentSettings.bank_transfer.account_holder || ''} onChange={e => setPaymentSettings(s => ({ ...s, bank_transfer: { ...s.bank_transfer, account_holder: e.target.value } }))} /><Field label="رقم الحساب المقنع فقط" value={paymentSettings.bank_transfer.account_number_masked || ''} placeholder="•••• 1234" onChange={e => setPaymentSettings(s => ({ ...s, bank_transfer: { ...s.bank_transfer, account_number_masked: e.target.value } }))} /><Field label="العملة" value={paymentSettings.bank_transfer.currency || 'SYP'} onChange={e => setPaymentSettings(s => ({ ...s, bank_transfer: { ...s.bank_transfer, currency: e.target.value } }))} /><Field label="تعليمات التحويل" value={paymentSettings.bank_transfer.instructions_ar || ''} onChange={e => setPaymentSettings(s => ({ ...s, bank_transfer: { ...s.bank_transfer, instructions_ar: e.target.value } }))} /><Button type="button" busy={busy} onClick={savePayment}>حفظ إعدادات الدفع الآمنة</Button></div></section>
      <section className="data-card settings-card"><h2>مزود الدفع الرسمي</h2><p className="map-help">هذه الشاشة تحفظ معرف المزود والبيئة فقط. لا تحفظ مفتاحًا سريًا؛ يقرأ Webhook السر من <code>PAYMENT_WEBHOOK_SECRET</code> في بيئة الخادم.</p><div className="form-grid"><label className="check-field"><input type="checkbox" checked={providerSettings.enabled === true} onChange={e => setProviderSettings(s => ({ ...s, enabled: e.target.checked }))} /> تفعيل استقبال Webhook</label><Field label="معرف المزود" value={providerSettings.provider_id || 'none'} onChange={e => setProviderSettings(s => ({ ...s, provider_id: e.target.value }))} placeholder="none أو provider_id" /><label className="field"><span>البيئة</span><select value={providerSettings.environment || 'sandbox'} onChange={e => setProviderSettings(s => ({ ...s, environment: e.target.value }))}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></label><Field label="العملة" value={providerSettings.currency || 'SYP'} onChange={e => setProviderSettings(s => ({ ...s, currency: e.target.value }))} /><Button type="button" busy={busy} onClick={saveProvider}>حفظ إعداد المزود</Button></div></section>
      <section className="data-card settings-card"><h2>الإشعارات الجماعية</h2><div className="form-grid"><Field label="العنوان" value={broadcast.title} onChange={e => setBroadcast({ ...broadcast, title: e.target.value })} /><Field label="النص" value={broadcast.body} onChange={e => setBroadcast({ ...broadcast, body: e.target.value })} /><label className="field"><span>الفئة</span><select value={broadcast.target_role} onChange={e => setBroadcast({ ...broadcast, target_role: e.target.value })}><option value="customer">العملاء</option><option value="courier">المناديب</option><option value="vendor_admin">التجار</option><option value="all">الجميع</option></select></label><Button type="button" busy={busy} onClick={sendBroadcast}>إرسال إشعار</Button></div></section>
      <section className="data-card settings-card"><div className="section-heading"><h2>البنرات</h2><Button type="button" variant="secondary" onClick={addBanner}>+ بنر</Button></div>{(config.banners || []).map((banner, index) => <div className="banner-config" key={index}><Field label="العنوان" value={banner.title || ''} onChange={e => update('banners', config.banners.map((b, i) => i === index ? { ...b, title: e.target.value } : b))} /><Field label="رابط الصورة" value={banner.image_url || ''} onChange={e => update('banners', config.banners.map((b, i) => i === index ? { ...b, image_url: e.target.value } : b))} /><label className="field"><span>رفع صورة WebP أقل من 150KB</span><input type="file" accept="image/*" disabled={uploadBusy} onChange={e => uploadAsset(e, `banner_${index}`, 'banners')} /></label><label className="check-field"><input type="checkbox" checked={banner.is_active !== false} onChange={e => update('banners', config.banners.map((b, i) => i === index ? { ...b, is_active: e.target.checked } : b))} /> فعال</label></div>)}</section>
      <section className="data-card settings-card"><h2>المتاجر والعروض</h2><label className="field"><span>متاجر التوصيل المجاني</span><select multiple value={config.free_delivery_vendor_ids || []} onChange={e => update('free_delivery_vendor_ids', [...e.target.selectedOptions].map(o => o.value))}>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label className="field"><span>المتاجر المميزة</span><select multiple value={config.featured_vendor_ids || []} onChange={e => update('featured_vendor_ids', [...e.target.selectedOptions].map(o => o.value))}>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><Button type="submit" busy={busy}>حفظ كل الإعدادات</Button></section>
    </form>
    <section className="data-card settings-card"><h2>سجل الحركات والتعديلات</h2>{logs.length ? <table><thead><tr><th>الوقت</th><th>الأدمن</th><th>العملية</th><th>الهدف</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td>{log.created_at?.toDate?.()?.toLocaleString('ar-SY') || '—'}</td><td>{log.actor_email || log.actor_id || '—'}</td><td>{log.action}</td><td>{log.target}</td></tr>)}</tbody></table> : <EmptyState>لا توجد حركات مسجلة بعد.</EmptyState>}</section>
    <Toast toast={toast} />
  </>
}

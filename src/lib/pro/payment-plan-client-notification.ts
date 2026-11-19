// Round 12: in-app reminder to the CUSTOMER of a professional's payment plan (installment due soon or
// overdue). Push suppressed, never email/SMS. ContrataCR does not finance: the plan is the professional's.
export function isPaymentPlanClientNotification(type: string) {
  return type === 'pro_payment_plan_client';
}

export function paymentPlanClientData(data: unknown): { request_id: string; action: 'installment_due_soon' | 'installment_overdue'; due_date: string } | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (value.version !== 1 || (value.action !== 'installment_due_soon' && value.action !== 'installment_overdue')
    || typeof value.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.request_id)
    || typeof value.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.due_date)) return null;
  return { request_id: value.request_id, action: value.action, due_date: value.due_date };
}

export function paymentPlanClientCopy(data: unknown, locale: string) {
  const parsed = paymentPlanClientData(data);
  const en = locale === 'en';
  if (!parsed) return en
    ? { title: 'Payment plan', message: 'Open your project to review your payment plan.' }
    : { title: 'Plan de pagos', message: 'Abra su proyecto para revisar su plan de pagos.' };
  const day = new Intl.DateTimeFormat(en ? 'en-US' : 'es-CR', { dateStyle: 'medium', timeZone: 'America/Costa_Rica' }).format(new Date(parsed.due_date + 'T12:00:00-06:00'));
  if (parsed.action === 'installment_overdue') return en
    ? { title: 'Overdue installment', message: `An installment of your payment plan was due on ${day}. Review it in your project.` }
    : { title: 'Cuota vencida', message: `Una cuota de su plan de pagos venció el ${day}. Revísela en su proyecto.` };
  return en
    ? { title: 'Installment due soon', message: `An installment of your payment plan is due on ${day}. Review it in your project.` }
    : { title: 'Cuota próxima a vencer', message: `Una cuota de su plan de pagos vence el ${day}. Revísela en su proyecto.` };
}

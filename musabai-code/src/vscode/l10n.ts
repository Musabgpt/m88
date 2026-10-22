import { language } from './config';

const AR: Record<string, string> = {
  'Allow': 'سماح',
  'Deny': 'رفض',
  'Always allow': 'سماح دائمًا',
  'MusabAI wants to run a command': 'يريد MusabAI تشغيل أمر',
  'MusabAI wants to change a file outside the project': 'يريد MusabAI تعديل ملف خارج المشروع',
  'MusabAI wants to delete a file': 'يريد MusabAI حذف ملف',
  'MusabAI wants to use the laptop': 'يريد MusabAI استخدام اللابتوب',
  'MusabAI wants to use an MCP tool': 'يريد MusabAI استخدام أداة MCP',
  'MusabAI wants to use the browser': 'يريد MusabAI استخدام المتصفح',
  'Open a folder first.': 'افتح مجلدًا أولًا.',
  'Describe the change (Ctrl+K)': 'صف التعديل المطلوب (Ctrl+K)',
  'Describe the command to run': 'صف الأمر الذي تريد تشغيله',
  'MusabAI is editing…': 'MusabAI يعدّل…',
  'Writing the commit message…': 'أكتب رسالة الـ commit…',
  'No changes to commit.': 'لا توجد تغييرات لعمل commit.',
  'Accept': 'قبول',
  'Reject': 'رفض',
  'Accept all': 'قبول الكل',
  'Reject all': 'رفض الكل',
  'Open diff': 'عرض الفرق',
  'Trust and start': 'ثقة وتشغيل',
  'Not now': 'ليس الآن',
  'Reviewing the changes…': 'أراجع التغييرات…',
  'No problems found.': 'لم أجد مشاكل.',
  'Signed in to GitHub.': 'تم تسجيل الدخول إلى GitHub.',
  'Pull request created': 'تم إنشاء طلب الدمج',
  'Open on GitHub': 'افتح على GitHub',
  'Background agent finished': 'انتهى الوكيل الخلفي',
  'A new version of MusabAI Code is available': 'يتوفّر إصدار جديد من MusabAI Code',
  'you have': 'لديك',
  'View release': 'عرض الإصدار',
  'How to update': 'طريقة التحديث',
  'MusabAI Code is up to date.': 'MusabAI Code محدّث لآخر إصدار.',
  'Could not check for updates': 'تعذّر التحقق من التحديثات',
  'Background agent failed': 'فشل الوكيل الخلفي',
  'Import finished': 'اكتمل الاستيراد',
  'Key saved.': 'تم حفظ المفتاح.',
  'Key removed.': 'تم حذف المفتاح.',
};

/** English source strings, Arabic when the editor or the musabai.language setting is Arabic. */
export function t(text: string, ...args: (string | number)[]): string {
  const base = language() === 'ar' ? (AR[text] ?? text) : text;
  return args.reduce<string>((out, value, i) => out.replace(`{${i}}`, String(value)), base);
}

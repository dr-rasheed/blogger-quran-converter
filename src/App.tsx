import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, CheckCircle, Copy, AlertCircle, Loader2, ArrowLeft, Image as ImageIcon, Sparkles, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import mammoth from 'mammoth';
import { GoogleGenAI } from '@google/genai';

// Gemini AI initialization is moved inside the component


type ProcessStep = 'idle' | 'parsing' | 'ai-processing' | 'done' | 'error';

const SYSTEM_PROMPT = `أنت خبير محترف في تحرير النصوص وتهيئتها للنشر على منصة Google Blogger.
مهمتك هي استلام كود HTML خام (مستخرج من ملف وورد) وتنظيفه وتنسيقه ليصبح مقالاً جذاباً واحترافياً يقبله بلوجر بسلاسة.

القواعد الأساسية:
1. احتفظ بجميع الفقرات والنصوص الأساسية، ولا تحذف أي محتوى.
2. نسّق العناوين باستخدام (h2, h3, h4) بشكل منطقي.
3. قم بتنظيف الأكواد الزائدة (Clean up messy inline styles) ولكن حافظ على التنسيقات الأساسية كالعريض (Bold) والمائل (Italic).
4. استخدم CSS مضمن (Inline CSS) فقط للتنسيقات الخاصة (لأن بلوجر يمسح ملفات CSS الخارجية بسهولة). استخدم ألواناً احترافية تناسب المقالات (مثلاً ألوان داكنة للنصوص).
5. الجداول: نسقها باستخدام style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;" وأضف padding للخلايا.
6. الصور: احتفظ بأوسمة <img> كما هي (حتى لو كانت بصيغة base64).
7. الأرقام والهوامش: نسقها بشكل جميل.

القاعدة الذهبية (تمييز الآيات القرآنية):
لديك خبرة تامة بالقرآن الكريم. قم بالبحث بدقة داخل النص عن أي آيات قرآنية.
عندما تجد آية قرآنية، قم بتنسيقها وعزلها باستخدام قالب HTMLالتالي حصراً (مع استبدال القيم داخل الأقواس المربعة):

<blockquote dir="rtl" lang="ar" style="font-family: 'Amiri', 'Traditional Arabic', serif; background-color: #f0fdf4; border-right: 4px solid #16a34a; padding: 1.5rem; margin: 1.5rem 0; border-radius: 0.5rem; text-align: center; color: #064e3b; line-height: 2.2; font-size: 1.25rem; font-weight: bold;">
  <span style="color: #15803d;">﴿</span>
  [النص القرآني هنا كاملاً بالتشكيل إذا أمكن]
  <span style="color: #15803d;">﴾</span>
  <br />
  <span style="display: block; margin-top: 10px; font-size: 0.875rem; color: #166534; font-weight: normal; font-family: sans-serif;">
    <a href="https://quran.com/[رقم السورة]/[رقم الآية]" target="_blank" style="color: #166534; text-decoration: underline;">سورة [اسم السورة] - آية [رقم الآية]</a>
  </span>
</blockquote>

تأكد من مطابقة الآيات بدقة مع قاعدة بيانات القرآن الكريم واستنتج رقم واسم السورة ورقم الآية لوضعها في الرابط.
المخرج النهائي يجب أن يكون كود HTML المُعالج بالكامل. لا تضف أي نصوص أو مقدمات، أخرج فقط الكود النهائي جاهزاً للنسخ.`;

export default function App() {
  const [step, setStep] = useState<ProcessStep>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [outputHtml, setOutputHtml] = useState('');
  const [copied, setCopied] = useState(false);
  const [fileName, setFileName] = useState('');
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    setProgressLog(prev => [...prev, msg]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const finalApiKey = apiKey.trim() || process.env.GEMINI_API_KEY;
    if (!finalApiKey) {
      alert('يرجى إدخال مفتاح Gemini API أولاً للاستمرار.');
      if (e.target) e.target.value = '';
      return;
    }

    setFileName(file.name);
    setStep('parsing');
    setErrorMsg('');
    setProgressLog([]);
    setOutputHtml('');
    setCopied(false);

    try {
      addLog('جاري قراءة الملف وتجهيزه...');
      const arrayBuffer = await file.arrayBuffer();

      addLog('استخراج النصوص والجداول والصور من ملف الوورد...');
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const rawHtml = result.value;

      if (!rawHtml || !rawHtml.trim()) {
        throw new Error('لم يتم العثور على أي نصوص قابلة للقراءة في الملف.');
      }

      setStep('ai-processing');
      addLog('تم استخراج المحتوى بنجاح. جاري إرسال النص للذكاء الاصطناعي (Gemini 3.1 Pro)...');
      addLog('جاري اكتشاف وتمييز الآيات القرآنية...');
      addLog('جاري تهيئة كود HTML ليطابق متطلبات Blogger...');

      const ai = new GoogleGenAI({ apiKey: finalApiKey });
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-pro-preview',
        contents: "Here is the raw HTML extracted from the Word document:\n\n" + rawHtml,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.1, // low temp for accurate regex/Quranic text matching
        }
      });

      let cleanHtml = '';
      for await (const chunk of responseStream) {
        cleanHtml += chunk.text;
      }
      
      // Remove any trailing/leading markdown code fences if Gemini puts them
      cleanHtml = cleanHtml.replace(/^```html/i, '').replace(/```$/i, '').trim();
      
      setOutputHtml(cleanHtml);
      setStep('done');
      addLog('اكتملت المعالجة بنجاح!');

    } catch (err: any) {
      console.error(err);
      let errorText = err.message || 'حدث خطأ غير متوقع أثناء عملية المعالجة.';
      if (typeof errorText === 'string' && errorText.includes('429') && errorText.includes('credits are depleted')) {
        errorText = 'نفد رصيد مفتاح واجهة برمجة التطبيقات (API Key) الخاص بك أو تجاوزت الحد المسموح. يرجى التحقق من إعدادات الفوترة في منصة Google AI Studio.';
      } else if (typeof errorText === 'string' && errorText.includes('429')) {
        errorText = 'تم الوصول إلى الحد الأقصى للطلبات لمفتاح API هذا. يرجى المحاولة لاحقاً أو الترقية لمفتاح مدفوع.';
      } else if (typeof errorText === 'string' && errorText.includes('API_KEY_INVALID')) {
        errorText = 'مفتاح API غير صالح. يرجى التأكد من نسخه بالكامل وبدون مسافات.';
      }
      setErrorMsg(errorText);
      setStep('error');
    }

    if (e.target) e.target.value = ''; // reset
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setStep('idle');
    setFileName('');
    setOutputHtml('');
    setErrorMsg('');
    setProgressLog([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3 bg-emerald-100 text-emerald-600 rounded-full mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
            محول مقالات <span className="text-emerald-600">بلوجر</span>
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            قم برفع ملف Word وسيتم تحويله بالكامل وتنظيف الكود مع التعرّف التلقائي على الآيات القرآنية وتنسيقها بأجمل حُلّة.
          </p>
        </header>

        <main className="space-y-8">
          <AnimatePresence mode="wait">
            {step === 'idle' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-8 md:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
              >
                <input 
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileUpload}
                  className="hidden"
                  ref={fileInputRef}
                />
                
                <div className="w-full max-w-lg mx-auto mb-8 border border-slate-200 rounded-2xl bg-slate-50 p-6 text-right">
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    مفتاح Gemini API (اختياري إذا كان متوفراً):
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="ضع مفتاح AIzaSy... هنا (اختياري)"
                    className="w-full p-3 border border-slate-300 rounded-xl bg-white text-left focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    dir="ltr"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    يمكن للمستخدم إضافة المفتاح الخاص به. إذا تُرك فارغاً فسيتم الاعتماد على المفتاح المدمج في النظام.
                  </p>
                </div>

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full max-w-lg mx-auto py-16 px-6 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700 transition-all group flex flex-col items-center gap-4 cursor-pointer"
                >
                  <div className="p-4 bg-white rounded-full shadow-sm group-hover:scale-110 group-hover:text-emerald-600 transition-all">
                    <FileText className="w-10 h-10 text-slate-400 group-hover:text-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-xl text-slate-700">اضغط لرفع ملف الوورد (.docx)</p>
                    <p className="text-sm text-slate-500">يدعم النصوص، والصور، والجداول</p>
                  </div>
                </button>
                
                <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-slate-500 font-medium">
                  <span className="flex items-center gap-2"><ImageIcon className="w-5 h-5 text-indigo-400" /> يحافظ على الصور</span>
                  <span className="flex items-center gap-2" style={{fontFamily: 'Amiri, serif'}}><BookOpen className="w-5 h-5 text-emerald-500" /> يميز الآيات تلقائياً</span>
                  <span className="flex items-center gap-2"><FileText className="w-5 h-5 text-orange-400" /> يرتب الجداول</span>
                </div>
              </motion.div>
            )}

            {(step === 'parsing' || step === 'ai-processing') && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl p-8 md:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 max-w-2xl mx-auto"
              >
                <div className="flex flex-col items-center text-center space-y-6">
                  <Loader2 className="w-16 h-16 text-emerald-500 animate-spin" />
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-slate-800">
                      {step === 'parsing' ? 'جاري تحليل الملف...' : 'يجري العمل السحري...'}
                    </h2>
                    <p className="text-slate-500">{fileName}</p>
                  </div>

                  <div className="w-full bg-slate-100 rounded-lg p-6 mt-4 text-right space-y-3 shadow-inner">
                    <AnimatePresence>
                      {progressLog.map((log, idx) => (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={idx}
                          className="flex items-center gap-3 text-slate-700"
                        >
                          <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                          <span>{log}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 rounded-3xl p-8 md:p-12 border border-red-100 text-center max-w-2xl mx-auto"
              >
                <div className="inline-flex p-4 bg-red-100 text-red-600 rounded-full mb-4">
                  <AlertCircle className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-red-800 mb-2">عذراً، حدث خطأ!</h2>
                <p className="text-red-600 mb-8">{errorMsg}</p>
                <button 
                  onClick={reset}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 mx-auto"
                >
                  <RefreshCcw className="w-5 h-5" />
                  حاول مرة أخرى
                </button>
              </motion.div>
            )}

            {step === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                  <div className="flex items-center gap-4 text-emerald-800">
                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                    <div>
                      <h3 className="font-bold text-lg">اكتمل التجهيز بنجاح!</h3>
                      <p className="text-sm opacity-80 text-emerald-700">لقد أصبح الكود جاهزاً للصق في تبويب HTML بلوجر.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button 
                      onClick={copyToClipboard}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-lg shadow-slate-900/20"
                    >
                      {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                      {copied ? 'تم النسخ!' : 'نسخ الكود'}
                    </button>
                    <button 
                      onClick={reset}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-all border border-slate-200"
                      title="ملف جديد"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="bg-white border text-left border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[600px]">
                  <div className="bg-slate-100 border-b border-slate-200 px-4 py-3 flex justify-between items-center text-sm font-mono text-slate-500">
                     <span>Blogger_HTML_Output.html</span>
                  </div>
                  <div className="p-4 flex-1 overflow-auto bg-slate-50 font-mono text-xs sm:text-sm text-slate-800 whitespace-pre-wrap text-left" dir="ltr">
                    {outputHtml}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function BookOpen(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

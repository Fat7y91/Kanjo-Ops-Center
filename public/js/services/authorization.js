/* Kanjo Ops — تفويض إبرام التعاقدات (authorization issuance)
   A4 print-ready authorization letter. Gated to the single data-entry
   operator (user 2468) and hidden from every other role. */

const AUTHORIZATION_PIN = '2468';

window.kanjoCurrentUserPin = () => {
    const u = window.currentUser || {};
    return String(u.pin || u.pinCode || '').trim();
};

window.kanjoCanIssueAuthorization = () => {
    const u = window.currentUser || {};
    const pin = window.kanjoCurrentUserPin();
    if (pin) return pin === AUTHORIZATION_PIN;
    /* A session restored before the PIN was attached has no pin field; fall
       back to the unique data-entry identity so the rightful operator keeps
       access across reloads. */
    return u.role === 'data_entry' || String(u.name || '').trim() === 'يوزر إدخال البيانات';
};

const AUTHORIZATION_HTML = `
    <div class="auth-letter">
        <div class="auth-watermark" aria-hidden="true"><img src="logo.png" alt=""></div>
        <div class="auth-toolbar">
            <button type="button" onclick="closeAuthorizationLetter()" class="auth-btn auth-btn-ghost"><i class="fa-solid fa-arrow-right"></i> عودة للوحة الرئيسية</button>
            <div class="auth-toolbar-title"><i class="fa-solid fa-file-shield"></i> تفويض إبرام التعاقدات</div>
            <button type="button" onclick="printAuthorizationLetter()" class="auth-btn auth-btn-gold"><i class="fa-solid fa-print"></i> طباعة التفويض</button>
        </div>

        <div class="auth-page">
            <div class="auth-header">
                <div class="auth-header-logo"><img src="logo.png" alt="Kanjo"></div>
                <div class="auth-header-company">
                    <div class="auth-header-name">شركة كاند جوو لخدمات التوصيل والتجاره الالكترونيه</div>
                    <div class="auth-header-sub">(شركة ذات مسئولية محدودة) — المقيدة بالسجل التجاري استثمار القاهرة برقم (<span dir="ltr" style="display: inline-block; direction: ltr; unicode-bidi: isolate-override;">٣٠٨٢٣٤</span>)</div>
                </div>
                <div class="auth-header-badge">وثيقة رسمية</div>
            </div>

            <div class="auth-title">تفويض خاص بإبرام التعاقدات والتسويات التجارية</div>

            <div class="auth-date">إنه في يوم: ...................... الموافق: <span dir="rtl" style="unicode-bidi: isolate;">.... / .... / ٢٠٢٦م</span></div>

            <p class="auth-p">أقر أنا الموقع أدناه السيد/ فتحي عمر محمد علي، مصري الجنسية، أحمل بطاقة رقم قومي: (<span dir="ltr" style="display: inline-block; direction: ltr; unicode-bidi: isolate-override;">٢٥٩١٢١٨٣٢٠٠٠٥٨</span>)، بصفتي الممثل القانوني والمدير لشركة / كاند جوو لخدمات التوصيل والتجاره الالكترونيه، شركة ذات مسئولية محدودة، المقيدة بالسجل التجاري استثمار القاهرة برقم (<span dir="ltr" style="display: inline-block; direction: ltr; unicode-bidi: isolate-override;">٣٠٨٢٣٤</span>) والبطاقة الضريبية رقم (<span dir="ltr" style="display: inline-block; direction: ltr; unicode-bidi: isolate-override;">٧٨٣-٤١٠-٨٥٩</span>).</p>

            <p class="auth-p">بأنني قد فوضت ووكلت السيد/ محمود محمد عبده احمد الجمل، مصري الجنسية، يحمل بطاقة رقم قومي: (<span dir="ltr" style="display: inline-block; direction: ltr; unicode-bidi: isolate-override;">٢٩٧٠٧٠٧١٥٠٠٠٥١</span>).</p>

            <p class="auth-p">وذلك لتمثيل الشركة والقيام بمهام (إدارة التشغيل والتعاقدات) وتفويضه للقيام بالأعمال الآتية نيابة عن الشركة وباسمها:</p>

            <ol class="auth-list">
                <li>التمثيل والتعاقد: تمثيل الشركة أمام شركاء كانجو (التجار ومقدمي الخدمات بكافة أنواعهم) لغرض عرض منتجاتهم وخدماتهم على شبكة منصة (كانجو - Kanjo).</li>
                <li>إبرام العقود: التفاوض، وإبرام، والتوقيع على "عقود انضمام التجار" نيابة عن الشركة، والاتفاق على نسب العمولات التشغيلية وفقاً للوائح وسياسات التسعير المعتمدة من إدارة الشركة.</li>
                <li>المستندات التجارية: استلام وتسليم المستندات التجارية والضريبية والصحية الخاصة بالتجار اللازمة لإتمام ومراجعة عمليات التشغيل.</li>
                <li>الملاحق التشغيلية: التوقيع على أي ملاحق تنظيمية أو إقرارات تشغيلية تابعة لعقود الانضمام الأساسية والتي تنظم العمل اليومي.</li>
                <li>التسويات المالية (التحصيل والسداد): إجراء التسويات المالية اليومية أو الدورية مع التجار، وتحصيل المبالغ النقدية المستحقة للشركة، وتسديد مستحقات التجار النقدية، واستلام وتسليم الإيصالات والفواتير والمخالصات المالية المتعلقة بعمليات التشغيل، وذلك وفقاً للدورة المستندية المعتمدة بالشركة.</li>
            </ol>

            <div class="auth-section-title">نطاق وصلاحية التفويض:</div>
            <p class="auth-p">يقتصر هذا التفويض حصرياً على المهام التشغيلية والتجارية المذكورة أعلاه لتسيير أعمال المنصة. ولا يحق للمفوض إليه التوقيع على أي شيكات أو كمبيالات أو قروض، أو فتح أو غلق حسابات بنكية، أو تمثيل الشركة أمام الجهات القضائية، أو التصرف بالبيع أو الرهن في أي من أصول الشركة وممتلكاتها.</p>

            <div class="auth-section-title">مدة التفويض:</div>
            <p class="auth-p">يسري هذا التفويض لمدة (سنة واحدة) تبدأ من تاريخ توقيعه أدناه، ويُعد لاغياً بانتهاء هذه المدة، أو بصدور إخطار كتابي من إدارة الشركة بإلغائه ووقف العمل به قبل ذلك الموعد.</p>

            <p class="auth-p">وهذا تفويض مني بذلك يقر به العمل دون أدنى مسئولية تجاه الغير متى تجاوز المفوض حدود هذا التفويض.</p>

            <div class="auth-signature">
                <div class="auth-signature-text">
                    <div class="auth-signature-title">المقر بما فيه (المدير والممثل القانوني):</div>
                    <div class="auth-signature-name">السيد/ فتحي عمر محمد علي</div>
                    <div class="auth-signature-line">التوقيع: ....................................</div>
                </div>
                <div class="auth-stamp">
                    <div class="auth-stamp-label">الختم:</div>
                    <div class="auth-stamp-space"></div>
                </div>
            </div>

            <div class="auth-footer">شركة كاند جوو لخدمات التوصيل والتجارة الإلكترونية — وثيقة تفويض رسمية</div>
        </div>
    </div>
`;

window.buildAuthorizationHtml = () => AUTHORIZATION_HTML;

window.openAuthorizationLetter = () => {
    if (!window.kanjoCanIssueAuthorization()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة لمستخدم إدخال البيانات فقط', false);
        return;
    }
    const view = document.getElementById('authorizationView');
    const dashboard = document.getElementById('dashboardSection');
    if (view && !view.dataset.built) {
        view.innerHTML = AUTHORIZATION_HTML;
        view.dataset.built = '1';
    }
    if (dashboard) dashboard.classList.add('hidden');
    if (view) view.classList.remove('hidden');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
};

window.closeAuthorizationLetter = () => {
    const view = document.getElementById('authorizationView');
    const dashboard = document.getElementById('dashboardSection');
    if (view) view.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
};

window.printAuthorizationLetter = () => {
    if (!window.kanjoCanIssueAuthorization()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة لمستخدم إدخال البيانات فقط', false);
        return;
    }
    const view = document.getElementById('authorizationView');
    if (view && view.classList.contains('hidden')) window.openAuthorizationLetter();
    setTimeout(() => window.print(), 150);
};

export {};

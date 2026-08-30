/* Kanjo Landing — Merchant Lead Registration
   ----------------------------------------------
   Public "انضم كشريك تجاري" form. Captures the store details and writes a
   single document to the `merchant_leads` collection using the same Firebase
   project as the ops dashboard (kanjo-desouk). Uses the app's public web API
   key exactly like the ops client does, with a temporary anonymous Firebase
   user so the Firestore `merchant_leads` create rule (isSignedIn) is satisfied.

   Field mapping (form -> document):
     store_name      -> storeName
     owner_name      -> ownerName
     phone           -> phone
     category        -> category
     interest        -> partnershipType
     city            -> city
     (auto)          -> createdAt (serverTimestamp)
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0",
    authDomain: "kanjo-desouk.firebaseapp.com",
    projectId: "kanjo-desouk",
    storageBucket: "kanjo-desouk.firebasestorage.app",
    messagingSenderId: "253872156774",
    appId: "1:253872156774:web:1d554b3bf0b78b98c77da7",
    measurementId: "G-FBM6G2RF1B"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const SUCCESS_HTML = 'تم تسجيل بياناتك بنجاح ✔️';
const ERROR_HTML = 'حدث خطأ، حاول مرة أخرى';
const IDLE_HTML = 'أرسل بياناتي وسجّل شراكتي <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M13 7l5 5-5 5M6 12h12"/></svg>';

const setButtonState = (btn, state) => {
    if (!btn) return;
    if (state === 'idle') {
        btn.disabled = false;
        btn.innerHTML = IDLE_HTML;
        btn.classList.add('btn-gold');
        btn.classList.remove('!bg-emerald-500', '!bg-red-500', '!from-emerald-500', '!to-emerald-500', '!from-red-500', '!to-red-500', 'shadow-none');
        btn.style.background = '';
    } else if (state === 'success') {
        btn.disabled = true;
        btn.innerHTML = SUCCESS_HTML;
        btn.classList.remove('btn-gold');
        btn.classList.add('!bg-emerald-500', '!from-emerald-500', '!to-emerald-500', 'shadow-none');
        btn.style.background = 'linear-gradient(to left, #10b981, #059669)';
    } else if (state === 'error') {
        btn.disabled = false;
        btn.innerHTML = ERROR_HTML;
        btn.classList.remove('btn-gold');
        btn.classList.add('!bg-red-500', '!from-red-500', '!to-red-500', 'shadow-none');
        btn.style.background = 'linear-gradient(to left, #ef4444, #dc2626)';
    }
};

const readForm = () => {
    const val = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };
    return {
        storeName: val('lead-store-name'),
        ownerName: val('lead-owner-name'),
        phone: val('lead-phone'),
        category: val('lead-category'),
        partnershipType: val('lead-interest'),
        city: val('lead-city')
    };
};

const resetForm = (form) => {
    if (!form) return;
    form.reset();
    const defaultCity = document.getElementById('lead-city');
    if (defaultCity) defaultCity.value = 'desouk';
};

const init = () => {
    const form = document.getElementById('lead-form');
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = readForm();

        /* Basic client-side guard before hitting the network. */
        if (!data.storeName || !data.ownerName || !data.phone || !data.category || !data.partnershipType || !data.city) {
            setButtonState(btn, 'error');
            setTimeout(() => setButtonState(btn, 'idle'), 2500);
            return;
        }

        setButtonState(btn, 'success');

        try {
            /* Anonymous sign-in so the merchant_leads create rule (isSignedIn)
               is satisfied — the same baseline auth the ops dashboard uses. */
            if (!auth.currentUser) {
                await signInAnonymously(auth);
            }
            await addDoc(collection(db, 'merchant_leads'), {
                ...data,
                createdAt: serverTimestamp(),
                source: 'landing_page'
            });
            resetForm(form);
            setTimeout(() => setButtonState(btn, 'idle'), 4000);
        } catch (err) {
            console.error('[landing] lead submission failed:', err);
            setButtonState(btn, 'error');
            setTimeout(() => setButtonState(btn, 'idle'), 4000);
        }
    });
};

init();

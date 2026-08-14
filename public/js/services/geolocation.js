/* Kanjo Ops — Geolocation & Nominatim Reverse Geocoding */

async function getCleanAddressFromCoords(lat, lon) {

    try {

        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {

            headers: {

                'Accept-Language': 'ar'

            }

        });

        

        if (!response.ok) return null;

        

        const data = await response.json();

        if (data && data.address) {

            const addr = data.address;

            const road = addr.road || addr.pedestrian || addr.footway || addr.street || '';

            const houseNumber = addr.house_number || '';

            const neighbourhood = addr.neighbourhood || addr.suburb || addr.city_district || '';

            const city = addr.city || addr.town || addr.village || addr.state || '';

            

            let parts = [];

            if (road) parts.push(road);

            if (houseNumber) parts.push(`مبنى ${houseNumber}`);

            if (neighbourhood && neighbourhood !== city) parts.push(neighbourhood);

            if (city) parts.push(city);

            

            if (parts.length > 0) {

                return parts.join('، ');

            }

        }

        return data.display_name || `${lat}, ${lon}`;

    } catch (e) {

        return null;

    }

}



async function checkAndUpdateMissingAddresses(tasksCache) {

    if (!currentUser || (currentUser.name !== 'أ/ محمود' && currentUser.role !== 'founder')) return;

    if (window.hasRunGeoUpdate) return;

    window.hasRunGeoUpdate = true;

    

    let updateCount = 0;

    

    for (let t of tasksCache) {

        if (updateCount >= 5) break;

        

        if ((!t.address || t.address.trim() === '') && t.attendances && t.attendances.length > 0) {

            let lastAttWithLoc = t.attendances.slice().reverse().find(a => a.loc && a.loc.includes(','));

            if (lastAttWithLoc) {

                const [lat, lon] = lastAttWithLoc.loc.split(',').map(Number);

                if (!isNaN(lat) && !isNaN(lon)) {

                    await new Promise(res => setTimeout(res, 2000));

                    let cleanAddr = await getCleanAddressFromCoords(lat, lon);

                    if (cleanAddr) {

                        const baseN = getBaseName(t.name);

                        const q = query(collection(db, "tasks"));

                        const snap = await getDocs(q);

                        const batch = writeBatch(db);

                        snap.forEach(docSnap => {

                            if (getBaseName(docSnap.data().name) === baseN) {

                                batch.update(docSnap.ref, { address: cleanAddr });

                            }

                        });

                        await batch.commit();

                        updateCount++;

                    }

                }

            }

        }

    }

}

window.getCleanAddressFromCoords = getCleanAddressFromCoords;
window.checkAndUpdateMissingAddresses = checkAndUpdateMissingAddresses;

/**
 * تحديد موقع سريع ومستقر — يمنع تهنيج أزرار الزيارة
 * يستخدم مهلة واضحة + آخر موقع معروف عند الحاجة
 */
window.getCurrentPositionFast = (options = {}) => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('NO_GEO'));
            return;
        }
        const opts = {
            enableHighAccuracy: options.enableHighAccuracy === true,
            timeout: options.timeout || 12000,
            maximumAge: options.maximumAge != null ? options.maximumAge : 60000
        };
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('TIMEOUT'));
        }, (opts.timeout || 12000) + 1500);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(pos);
            },
            (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(err);
            },
            opts
        );
    });
};

window.setVisitButtonLoading = (taskId, type, isLoading) => {
    const btn = document.getElementById(`visit-btn-${taskId}`);
    const wrap = document.getElementById(`visit-wrap-${taskId}`);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.classList.add('visit-btn-loading');
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>${type === 'start' ? 'جاري بدء الزيارة...' : 'جاري إنهاء الزيارة...'}</span>`;
        if (wrap) wrap.classList.add('visit-wrap-busy');
    } else {
        btn.disabled = false;
        btn.classList.remove('visit-btn-loading');
        if (wrap) wrap.classList.remove('visit-wrap-busy');
    }
};

export { getCleanAddressFromCoords, checkAndUpdateMissingAddresses };

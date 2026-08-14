/* Kanjo Ops — Chart.js Statistical Charts */

const valueLabelsPlugin = {

    id: 'valueLabelsPlugin',

    afterDatasetsDraw(chart) {

        const ctx = chart.ctx;

        chart.data.datasets.forEach((dataset, i) => {

            const meta = chart.getDatasetMeta(i);

            meta.data.forEach((bar, index) => {

                const dataValue = dataset.data[index];

                if (dataValue !== undefined && dataValue !== null) {

                    ctx.fillStyle = '#1e293b';

                    ctx.font = 'bold 12px Tahoma';

                    ctx.textAlign = 'center';

                    ctx.textBaseline = 'bottom';

                    ctx.fillText(dataValue + '%', bar.x, bar.y - 6);

                }

            });

        });

    }

};



const centerLogoPlugin = {

    id: 'centerLogoPlugin',

    afterDraw(chart) {

        if (chart.config.type !== 'doughnut') return;

        const ctx = chart.ctx;

        const chartArea = chart.chartArea;

        if (!chartArea) return;

        

        const centerX = chartArea.left + (chartArea.right - chartArea.left) / 2;

        const centerY = chartArea.top + (chartArea.bottom - chartArea.top) / 2;

        

        if (!window._kanjoLogoImg) {

            const img = new Image();

            img.src = 'logo.png';

            img.onload = () => {

                window._kanjoLogoImg = img;

                chart.draw();

            };

        } else if (window._kanjoLogoImg.complete) {

            const sideLength = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);

            const size = Math.max(50, Math.min(sideLength * 0.32, 75));

            ctx.save();

            ctx.drawImage(window._kanjoLogoImg, centerX - size / 2, centerY - size / 2, size, size);

            ctx.restore();

        }

    }

};



function renderAdvancedCharts(perfData, catCounts) {

    const ctxPerf = document.getElementById('chartPerformance');

    const ctxCat = document.getElementById('chartCategories');

    

    if(!ctxPerf || !ctxCat) return;



    if (perfChartInstance) perfChartInstance.destroy();

    perfChartInstance = new Chart(ctxPerf, {

        type: 'bar',

        data: {

            labels: ['متوسط العمولة المستهدفة', 'متوسط العمولة المحققة'],

            datasets: [{

                label: 'نسبة العمولة %',

                data: [perfData.targets, perfData.achieved],

                backgroundColor: ['#8B5CF6', '#10B981'],

                borderRadius: 8

            }]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: { legend: { display: false } },

            scales: { 

                y: { 

                    beginAtZero: true, 

                    max: 25 

                } 

            }

        },

        plugins: [valueLabelsPlugin]

    });



    const rawCatLabels = Object.keys(catCounts);

    const catData = Object.values(catCounts);

    const formattedLabels = rawCatLabels.map((lbl, idx) => `${lbl} (${catData[idx]} محل)`);



    if (catChartInstance) catChartInstance.destroy();

    catChartInstance = new Chart(ctxCat, {

        type: 'doughnut',

        data: {

            labels: formattedLabels.length > 0 ? formattedLabels : ['لا توجد تعاقدات بعد'],

            datasets: [{

                data: catData.length > 0 ? catData : [1],

                backgroundColor: ['#6D28D9', '#3B82F6', '#F59E0B', '#EF4444', '#10B981', '#EC4899', '#8B5CF6']

            }]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: { 

                legend: { 

                    position: 'right', 

                    labels: { 

                        boxWidth: 14, 

                        font: { size: 11, weight: 'bold' },

                        color: '#1E293B'

                    } 

                } 

            }

        },

        plugins: [centerLogoPlugin]

    });

}

window.renderAdvancedCharts = renderAdvancedCharts;
window.valueLabelsPlugin = valueLabelsPlugin;
window.centerLogoPlugin = centerLogoPlugin;

export { renderAdvancedCharts, valueLabelsPlugin, centerLogoPlugin };

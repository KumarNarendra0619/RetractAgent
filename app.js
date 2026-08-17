// --- Global State ---
let globalData = [];
let lockersData = {};
let currentExportData = [];
let fuseInstance = null;
let activeReasonFilter = "ALL";
let currentView = 'lockers'; 

// --- Instances ---
let chartInstance = null;
let myMap = null;
let networkInstance = null;
let spatialMarkers = [];
let playInterval = null;
let isPlaying = false;

// AI Category Colors
const REASON_COLORS = {
    "Paper Mill / Fake Peer Review": "bg-purple-100 text-purple-800 border-purple-200",
    "Data Fabrication / Manipulation": "bg-red-100 text-red-800 border-red-200",
    "Plagiarism / Text Recycling": "bg-amber-100 text-amber-800 border-amber-200",
    "Image Manipulation": "bg-indigo-100 text-indigo-800 border-indigo-200",
    "Authorship / Ethics Dispute": "bg-orange-100 text-orange-800 border-orange-200",
    "Publisher / Administrative Error": "bg-blue-100 text-blue-800 border-blue-200",
    "Unspecified / Unknown": "bg-gray-100 text-gray-700 border-gray-200"
};

// --- Initialization ---
async function loadData() {
    try {
        const response = await fetch('data/retractions.json');
        globalData = await response.json();
        
        // Init Fuse Search
        fuseInstance = new Fuse(globalData, {
            keys: [{name: 'title', weight: 0.5}, {name: 'institutions', weight: 0.3}, {name: 'doi', weight: 0.2}, {name: 'publisher', weight: 0.1}],
            threshold: 0.3, ignoreLocation: true
        });

        buildLockers();
        switchView('lockers');
    } catch (e) {
        document.getElementById('results-grid').innerHTML = `<p class="col-span-full text-center text-red-600 font-bold mt-10">Data not found. Please run the backend Python script via GitHub Actions first.</p>`;
    }
}

// --- View Routing ---
function switchView(viewName) {
    currentView = viewName;
    
    // Hide all main containers
    ['results-grid', 'analytics-view', 'map-view', 'network-view', 'publishers-view', 'scanner-view'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    
    // Show selected container & manage search bar visibility
    if (viewName === 'articles' || viewName === 'lockers') {
        document.getElementById('results-grid').classList.remove('hidden');
        document.getElementById('search-controls').classList.remove('hidden');
        if (viewName === 'lockers') renderLockers(document.getElementById('main-search').value);
        else applyFiltersAndRender();
    } else {
        document.getElementById('search-controls').classList.add('hidden');
        if (viewName === 'analytics') { document.getElementById('analytics-view').classList.remove('hidden'); renderAnalytics(); }
        if (viewName === 'map') { document.getElementById('map-view').classList.remove('hidden'); renderMap(); setTimeout(() => myMap.invalidateSize(), 100); }
        if (viewName === 'network') { document.getElementById('network-view').classList.remove('hidden'); renderNetwork(); }
        if (viewName === 'publishers') { document.getElementById('publishers-view').classList.remove('hidden'); renderPublishers(); }
        if (viewName === 'scanner') { document.getElementById('scanner-view').classList.remove('hidden'); }
    }

    // Update Button Styles
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.replace('bg-blue-600', 'bg-gray-200');
        btn.classList.replace('bg-purple-600', 'bg-gray-200');
        btn.classList.replace('text-white', 'text-gray-800');
    });
    const activeBtn = document.getElementById(`view-${viewName}`);
    if (viewName === 'scanner') {
        activeBtn.classList.replace('bg-gray-200', 'bg-purple-600');
    } else {
        activeBtn.classList.replace('bg-gray-200', 'bg-blue-600');
    }
    activeBtn.classList.replace('text-gray-800', 'text-white');
}

['lockers', 'articles', 'analytics', 'map', 'network', 'publishers', 'scanner'].forEach(view => {
    document.getElementById(`view-${view}`).addEventListener('click', () => switchView(view));
});

// --- Search & Filters ---
document.getElementById('main-search').addEventListener('input', () => {
    if (currentView === 'lockers') renderLockers(document.getElementById('main-search').value);
    else applyFiltersAndRender();
});

window.filterByReason = function(category) {
    activeReasonFilter = category;
    document.querySelectorAll('.pill-btn').forEach(btn => {
        btn.className = "pill-btn px-3 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded-full hover:bg-gray-300 transition";
    });
    event.target.className = "pill-btn active px-3 py-1 bg-gray-900 text-white text-xs font-semibold rounded-full transition";
    if (currentView === 'articles') applyFiltersAndRender();
};

function applyFiltersAndRender() {
    let results = globalData;
    const query = document.getElementById('main-search').value.trim();
    
    if (query.length > 1 && fuseInstance) results = fuseInstance.search(query).map(res => res.item);
    if (activeReasonFilter !== "ALL") results = results.filter(art => art.reason_category === activeReasonFilter);
    
    renderArticles(results);
}

// --- Renderers ---
function buildLockers() {
    lockersData = {};
    globalData.forEach(art => {
        (art.institutions || []).forEach(uni => {
            if (!lockersData[uni]) lockersData[uni] = { count: 0, articles: [] };
            lockersData[uni].count += 1;
            lockersData[uni].articles.push(art);
        });
    });
}

function renderLockers(filterText = "") {
    const grid = document.getElementById('results-grid');
    grid.innerHTML = "";
    currentExportData = [];

    const sortedUnis = Object.keys(lockersData)
        .filter(uni => uni.toLowerCase().includes(filterText.toLowerCase()))
        .sort((a, b) => lockersData[b].count - lockersData[a].count);

    if (sortedUnis.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center py-10 text-gray-500">No institutions found matching your search.</p>`;
        return;
    }

    sortedUnis.forEach(uni => {
        lockersData[uni].articles.forEach(a => currentExportData.push(a));
        
        const locker = document.createElement('div');
        locker.className = "bg-white p-6 rounded-lg shadow border border-red-100 hover:shadow-lg flex flex-col justify-between transition";
        locker.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-4">
                    <h3 class="font-bold text-xl text-gray-800">${uni}</h3>
                    <span class="bg-red-100 text-red-800 text-sm font-bold px-3 py-1 rounded-full">${lockersData[uni].count}</span>
                </div>
            </div>
            <div class="mt-4 flex justify-between items-center border-t border-gray-100 pt-4">
                <button onclick="showUniArticles('${uni.replace(/'/g, "\\'")}')" class="text-blue-600 hover:underline text-sm font-bold">View Records &rarr;</button>
                <button onclick="generateUniversityPDF('${uni.replace(/'/g, "\\'")}')" class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded shadow-sm border border-gray-200">📄 Export Dossier</button>
            </div>
        `;
        grid.appendChild(locker);
    });
}

window.showUniArticles = function(uniName) {
    switchView('articles');
    renderArticles(lockersData[uniName].articles);
    
    const grid = document.getElementById('results-grid');
    const header = document.createElement('div');
    header.className = "col-span-full mb-4 flex justify-between items-center bg-gray-50 p-4 border rounded shadow-sm";
    header.innerHTML = `
        <h2 class="text-lg font-bold text-gray-800">Showing retractions for: <span class="text-blue-600">${uniName}</span></h2>
        <button onclick="switchView('lockers')" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded shadow-sm text-sm font-bold transition">&larr; Back to Lockers</button>
    `;
    grid.prepend(header);
};

function renderArticles(articles) {
    currentExportData = articles;
    const grid = document.getElementById('results-grid');
    grid.innerHTML = "";

    if (articles.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center py-10 text-gray-500">No records match the current filters.</p>`;
        return;
    }

    articles.forEach(art => {
        const reason = art.reason_category || "Unspecified / Unknown";
        const badgeColor = REASON_COLORS[reason] || REASON_COLORS["Unspecified / Unknown"];
        
        const card = document.createElement('div');
        card.className = "bg-white p-5 rounded-lg shadow border border-gray-200 flex flex-col hover:shadow-md transition";
        card.innerHTML = `
            <div class="flex-grow">
                <div class="flex flex-wrap gap-1.5 mb-3">
                    <span class="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded tracking-wide">RETRACTED</span>
                    <span class="px-2 py-0.5 border ${badgeColor} text-[10px] font-bold rounded">${reason}</span>
                    <span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded border border-gray-200">${art.year || 'N/A'}</span>
                </div>
                <h3 class="font-bold text-md text-gray-900 mb-2 leading-tight">${art.title || 'Untitled'}</h3>
                <p class="text-xs text-gray-600 mb-2"><span class="font-bold">Publisher:</span> ${art.publisher || 'Unknown'}</p>
                <p class="text-xs text-gray-500 line-clamp-2"><span class="font-bold">Inst:</span> ${(art.institutions || []).join(', ')}</p>
            </div>
            <div class="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
                <a href="${art.doi ? art.doi : '#'}" target="_blank" class="text-blue-600 hover:underline text-xs font-bold">View Source / DOI</a>
                <button onclick="openBlastRadius('${art.doi || ''}', '${(art.title || '').replace(/'/g, "\\'")}')" class="text-red-600 hover:text-red-800 text-xs font-bold bg-red-50 border border-red-100 px-2 py-1 rounded transition">💥 Blast Radius</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderPublishers() {
    const pubCounts = {};
    globalData.forEach(art => {
        const pub = art.publisher || "Unknown Publisher";
        pubCounts[pub] = (pubCounts[pub] || 0) + 1;
    });

    const sortedPubs = Object.keys(pubCounts).sort((a, b) => pubCounts[b] - pubCounts[a]).slice(0, 50);
    const tbody = document.getElementById('publisher-table-body');
    tbody.innerHTML = "";

    sortedPubs.forEach((pub, index) => {
        const count = pubCounts[pub];
        let riskBadge = '<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">Standard</span>';
        if (count > 500) riskBadge = '<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold animate-pulse">CRITICAL RISK</span>';
        else if (count > 100) riskBadge = '<span class="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold">High Risk</span>';

        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 transition border-b border-gray-100">
                <td class="px-4 py-3 font-bold text-gray-900">#${index + 1}</td>
                <td class="px-4 py-3 font-semibold text-gray-800">${pub}</td>
                <td class="px-4 py-3 font-mono text-red-600 font-bold">${count}</td>
                <td class="px-4 py-3">${riskBadge}</td>
            </tr>
        `;
    });
}

// --- Specialized Features ---

// 1. Analytics Chart
function renderAnalytics() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const counts = {};
    globalData.forEach(a => { const y = a.year || 'Unknown'; counts[y] = (counts[y] || 0) + 1; });
    const labels = Object.keys(counts).filter(y => y !== 'Unknown').sort();
    
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Retractions', data: labels.map(y => counts[y]), backgroundColor: '#dc2626' }] },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

// 2. Map & Time Slider
async function renderMap(selectedYear = null) {
    if (!myMap) {
        myMap = L.map('spatial-map').setView([20, 0], 2);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(myMap);
    }
    spatialMarkers.forEach(m => myMap.removeLayer(m));
    spatialMarkers = [];

    const uniCounts = {};
    globalData.forEach(art => {
        if (!selectedYear || (art.year || 0) <= selectedYear) {
            (art.institutions || []).forEach(uni => { uniCounts[uni] = (uniCounts[uni] || 0) + 1; });
        }
    });

    try {
        const res = await fetch('data/spatial_lockers.json');
        const spatialData = await res.json();
        spatialData.forEach(inst => {
            const count = uniCounts[inst.institution] || 0;
            if (count > 0) {
                const marker = L.circleMarker([inst.lat, inst.lon], { radius: Math.max(3, Math.sqrt(count)*2.2), fillColor: "#dc2626", color: "#fff", weight: 1, fillOpacity: 0.7 })
                    .bindPopup(`<strong>${inst.institution}</strong><br>Retractions: ${count}`);
                marker.addTo(myMap);
                spatialMarkers.push(marker);
            }
        });
    } catch(e) { console.warn("Spatial data missing. Ensure geocoding script has run."); }
}

document.getElementById('map-year-slider').addEventListener('input', (e) => {
    document.getElementById('map-year-display').innerText = `Up to ${e.target.value}`;
    renderMap(parseInt(e.target.value));
});

document.getElementById('btn-play-map').addEventListener('click', (e) => {
    const slider = document.getElementById('map-year-slider');
    if (isPlaying) { clearInterval(playInterval); isPlaying = false; e.target.innerText = "▶ Play"; e.target.classList.replace('bg-gray-600', 'bg-red-600'); } 
    else {
        isPlaying = true; e.target.innerText = "⏸ Pause"; e.target.classList.replace('bg-red-600', 'bg-gray-600'); slider.value = 2010;
        playInterval = setInterval(() => {
            let current = parseInt(slider.value);
            if (current >= 2026) { clearInterval(playInterval); isPlaying = false; e.target.innerText = "▶ Play"; e.target.classList.replace('bg-gray-600', 'bg-red-600'); return; }
            slider.value = ++current;
            document.getElementById('map-year-display').innerText = `Up to ${current}`;
            renderMap(current);
        }, 1000);
    }
});

// 3. Network Graph
function renderNetwork() {
    const nodeMap = new Map();
    const edgeMap = new Map();
    
    globalData.forEach(art => {
        const unis = art.institutions || [];
        unis.forEach(u => nodeMap.set(u, (nodeMap.get(u) || 0) + 1));
        for (let i = 0; i < unis.length; i++) {
            for (let j = i + 1; j < unis.length; j++) {
                const pair = [unis[i], unis[j]].sort();
                const edge = `${pair[0]}|${pair[1]}`;
                edgeMap.set(edge, (edgeMap.get(edge) || 0) + 1);
            }
        }
    });

    const nodesArray = [], edgesArray = [], activeNodes = new Set();
    edgeMap.forEach((weight, edgeId) => {
        if (weight >= 1) { 
            const [src, tgt] = edgeId.split('|');
            edgesArray.push({ from: src, to: tgt, value: weight, title: `Co-Retractions: ${weight}` });
            activeNodes.add(src); activeNodes.add(tgt);
        }
    });

    activeNodes.forEach(uni => nodesArray.push({ id: uni, label: uni, value: nodeMap.get(uni), title: `${uni}<br>Total: ${nodeMap.get(uni)}` }));

    if (networkInstance) networkInstance.destroy();
    networkInstance = new vis.Network(document.getElementById('network-canvas'), 
        { nodes: new vis.DataSet(nodesArray), edges: new vis.DataSet(edgesArray) }, 
        { nodes: { shape: 'dot', color: { background: '#dc2626', border: '#991b1b' } }, physics: { stabilization: { iterations: 150 } } }
    );
}

// 4. DOI Live Verifier (PubPeer + Crossref)
document.getElementById('btn-check-doi').addEventListener('click', async () => {
    const doiInput = document.getElementById('doi-check').value.trim().toLowerCase();
    const resBox = document.getElementById('doi-result');
    if (!doiInput) return;
    
    const cleanDoi = doiInput.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '');
    resBox.className = "w-full md:w-1/3 flex items-center justify-center p-3 rounded-md font-bold text-sm bg-gray-200 text-gray-700 animate-pulse";
    resBox.innerHTML = "Checking PubPeer & Crossref...";

    // Check Local
    const localMatch = globalData.find(a => a.doi && a.doi.toLowerCase().includes(cleanDoi));
    if (localMatch) { resBox.className = "w-full md:w-1/3 flex flex-col items-center justify-center p-2 rounded-md bg-red-100 text-red-800 border-2 border-red-300"; resBox.innerHTML = `<span class="text-lg font-black">RETRACTED</span><span class="text-xs">Found in local database.</span>`; return; }

    try {
        // Check PubPeer
        const pubpeerRes = await fetch(`https://pubpeer.com/v3/publications?dois=${cleanDoi}`);
        const pubpeerData = await pubpeerRes.json();
        if (pubpeerData.feedbacks && pubpeerData.feedbacks.length > 0) {
            resBox.className = "w-full md:w-1/3 flex flex-col items-center justify-center p-2 rounded-md bg-orange-100 text-orange-800 border-2 border-orange-400"; 
            resBox.innerHTML = `<span class="text-lg font-black">HIGH RISK 🚨</span><span class="text-xs">Flagged on PubPeer (${pubpeerData.feedbacks.length} comments).</span><a href="${pubpeerData.feedbacks[0].url}" target="_blank" class="text-blue-600 underline mt-1 text-xs">Read Comments</a>`; 
            return;
        }

        // Check Crossref
        const res = await fetch(`https://api.crossref.org/works/${cleanDoi}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const isRetracted = data.message.update?.some(u => u.type === 'retraction');
        
        if (isRetracted) { resBox.className = "w-full md:w-1/3 flex flex-col items-center justify-center p-2 rounded-md bg-red-100 text-red-800 border-2 border-red-300"; resBox.innerHTML = `<span class="text-lg font-black">RETRACTED</span><span class="text-xs">Flagged by Crossref.</span>`; }
        else { resBox.className = "w-full md:w-1/3 flex flex-col items-center justify-center p-2 rounded-md bg-green-100 text-green-800 border border-green-300"; resBox.innerHTML = `<span class="text-lg font-black">CLEAR</span><span class="text-xs">No retractions found.</span>`; }
    } catch (e) { resBox.className = "w-full md:w-1/3 flex flex-col items-center justify-center p-2 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-300"; resBox.innerHTML = `<span class="text-lg font-black">UNKNOWN</span><span class="text-xs">Invalid DOI / Not in Crossref.</span>`; }
});

// 5. Blast Radius Modal (OpenAlex)
window.openBlastRadius = async function(doi, title) {
    const modal = document.getElementById('blast-radius-modal');
    document.getElementById('modal-article-title').innerText = title;
    const body = document.getElementById('modal-body');
    body.innerHTML = `<div class="text-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-3"></div><p class="text-sm text-gray-500">Tracing downstream citations...</p></div>`;
    modal.classList.remove('hidden');

    const cleanDoi = (doi || "").replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '');
    if (!cleanDoi) { body.innerHTML = `<p class="text-center py-6 text-gray-500">No valid DOI for this record.</p>`; return; }

    try {
        const workRes = await fetch(`https://api.openalex.org/works/https://doi.org/${cleanDoi}`);
        const workData = await workRes.json();
        const citingCount = workData.cited_by_count || 0;
        let citingArts = [];
        
        if (citingCount > 0 && workData.cited_by_api_url) {
            const citeRes = await fetch(`${workData.cited_by_api_url}&per_page=5`);
            citingArts = (await citeRes.json()).results || [];
        }

        body.innerHTML = `
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="bg-red-50 p-3 text-center border border-red-200 rounded"><span class="text-2xl font-black text-red-700">${citingCount}</span><p class="text-xs font-bold text-red-900 mt-1">Downstream Citations</p></div>
                <div class="bg-amber-50 p-3 text-center border border-amber-200 rounded"><span class="text-2xl font-black text-amber-700">${workData.publication_year || 'N/A'}</span><p class="text-xs font-bold text-amber-900 mt-1">Publication Year</p></div>
            </div>
            <h4 class="text-xs font-bold text-gray-500 uppercase">Sample Citing Works:</h4>
            <div class="space-y-2">
                ${citingArts.length > 0 ? citingArts.map(a => `<div class="p-3 bg-gray-50 border rounded text-xs"><p class="font-bold text-gray-800">${a.title}</p><a href="${a.doi}" target="_blank" class="text-blue-600 hover:underline mt-1 inline-block">View Paper &rarr;</a></div>`).join('') : '<p class="text-xs text-gray-500 italic">No indexed citations yet.</p>'}
            </div>`;
    } catch(e) { body.innerHTML = `<p class="text-center py-6 text-red-500 font-bold">Error fetching citation data from OpenAlex.</p>`; }
};
window.closeBlastModal = () => document.getElementById('blast-radius-modal').classList.add('hidden');

// 6. Tortured Phrase Scanner
const TORTURED_DICTIONARY = [
    { spin: "counterfeit consciousness", original: "artificial intelligence" },
    { spin: "deep learning", original: "profound neural network" },
    { spin: "colossal information", original: "big data" },
    { spin: "irregular backwoods", original: "random forest" },
    { spin: "bosom malignant growth", original: "breast cancer" },
    { spin: "left out completely", original: "omitted" },
    { spin: "vital bodily fluid", original: "blood" },
    { spin: "flawless execution", original: "perfect execution" }
];

document.getElementById('btn-scan-text').addEventListener('click', () => {
    const text = document.getElementById('risk-text-input').value.toLowerCase();
    const resultBox = document.getElementById('scan-results');
    resultBox.classList.remove('hidden');

    if (text.length < 50) {
        resultBox.className = "mt-6 p-4 rounded-lg border bg-yellow-50 border-yellow-200 text-yellow-800";
        resultBox.innerHTML = "<strong>Text too short.</strong> Please paste a full abstract.";
        return;
    }

    let foundPhrases = [];
    TORTURED_DICTIONARY.forEach(item => {
        if (text.includes(item.spin)) {
            foundPhrases.push(`Found <strong>"${item.spin}"</strong> (Likely spun from: <em>"${item.original}"</em>)`);
        }
    });

    if (foundPhrases.length > 0) {
        resultBox.className = "mt-6 p-4 rounded-lg border bg-red-50 border-red-300 text-red-900";
        resultBox.innerHTML = `<h3 class="font-bold text-lg mb-2">🚨 High Risk Detected</h3><p class="text-sm mb-3">This text contains known "Tortured Phrases", indicating AI spinning.</p><ul class="list-disc pl-5 text-sm space-y-1"><li>${foundPhrases.join('</li><li>')}</li></ul>`;
    } else {
        resultBox.className = "mt-6 p-4 rounded-lg border bg-green-50 border-green-300 text-green-900";
        resultBox.innerHTML = `<h3 class="font-bold text-lg mb-1">✅ No Obvious Red Flags</h3><p class="text-sm">No known tortured phrases detected.</p>`;
    }
});

// 7. Exports (CSV & PDF)
document.getElementById('export-csv').addEventListener('click', () => {
    if (currentExportData.length === 0) return alert("No data to export!");
    let csv = "data:text/csv;charset=utf-8,DOI,Title,Publisher,Year,Reason,Institutions\n";
    currentExportData.forEach(r => {
        csv += `${r.doi || ""},"${(r.title || "").replace(/"/g, '""')}","${(r.publisher || "").replace(/"/g, '""')}",${r.year || ""},"${r.reason_category || ""}","${(r.institutions || []).join("; ").replace(/"/g, '""')}"\n`;
    });
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csv)); link.setAttribute("download", "retract_radar_export.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

window.generateUniversityPDF = function(uniName) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const uniData = lockersData[uniName];
    if (!uniData) return;

    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 595.28, 70, 'F');
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(255, 255, 255);
    doc.text("INSTITUTIONAL INTEGRITY DOSSIER", 40, 38);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(148, 163, 184);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} | RetractRadar Engine`, 40, 54);

    doc.setTextColor(15, 23, 42); doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text(uniName, 40, 105);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.text(`Total Indexed Retractions: ${uniData.count}`, 40, 122);

    const tableData = uniData.articles.map(art => [ art.year || 'N/A', art.title || 'Untitled', art.reason_category || 'Unspecified', art.doi || 'N/A' ]);
    
    doc.autoTable({
        startY: 150, head: [['Year', 'Title', 'Category', 'DOI']], body: tableData,
        theme: 'striped', headStyles: { fillColor: [220, 38, 38] }, styles: { fontSize: 8 },
        columnStyles: { 0: {cellWidth: 35}, 1: {cellWidth: 200}, 2: {cellWidth: 100}, 3: {cellWidth: 160} },
        margin: { left: 40, right: 40 }
    });

    doc.save(`retract_radar_${uniName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.pdf`);
};

// Start App
loadData();

let globalData = [], lockersData = {};
let chartInstance = null, myMap = null, networkInstance = null;

async function loadData() {
    try {
        const res = await fetch('data/retractions.json');
        globalData = await res.json();
        buildLockers(); switchView('lockers');
    } catch(e) { document.getElementById('results-grid').innerHTML = 'Error loading data. Run backend scripts.'; }
}

function switchView(viewName) {
    ['results-grid', 'analytics-view', 'map-view', 'network-view', 'publishers-view', 'scanner-view'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.className = "nav-btn px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded shadow transition");
    document.getElementById(`view-${viewName}`).className = `nav-btn px-4 py-2 text-white font-medium rounded shadow transition ${viewName === 'scanner' ? 'bg-purple-600' : 'bg-blue-600'}`;
    
    if (viewName === 'lockers' || viewName === 'articles') {
        document.getElementById('results-grid').classList.remove('hidden');
        if (viewName === 'lockers') renderLockers(); else renderArticles(globalData);
    } else if (viewName === 'analytics') { document.getElementById('analytics-view').classList.remove('hidden'); renderAnalytics(); }
    else if (viewName === 'map') { document.getElementById('map-view').classList.remove('hidden'); renderMap(); setTimeout(()=>myMap.invalidateSize(),100); }
    else if (viewName === 'network') { document.getElementById('network-view').classList.remove('hidden'); renderNetwork(); }
    else if (viewName === 'publishers') { document.getElementById('publishers-view').classList.remove('hidden'); renderPublishers(); }
    else if (viewName === 'scanner') { document.getElementById('scanner-view').classList.remove('hidden'); }
}
['lockers', 'articles', 'analytics', 'map', 'network', 'publishers', 'scanner'].forEach(v => document.getElementById(`view-${v}`).addEventListener('click', () => switchView(v)));

function buildLockers() {
    lockersData = {};
    globalData.forEach(art => { (art.institutions || []).forEach(uni => { if(!lockersData[uni]) lockersData[uni] = {count:0, articles:[]}; lockersData[uni].count++; lockersData[uni].articles.push(art); }); });
}
function renderLockers() {
    const grid = document.getElementById('results-grid'); grid.innerHTML = "";
    Object.keys(lockersData).sort((a,b)=>lockersData[b].count - lockersData[a].count).forEach(uni => {
        grid.innerHTML += `${uni}${lockersData[uni].count} RetractionsView Records →`;
    });
}
window.showUniArticles = function(uni) { switchView('articles'); renderArticles(lockersData[uni].articles); };
function renderArticles(arts) {
    const grid = document.getElementById('results-grid'); grid.innerHTML = "";
    arts.forEach(a => grid.innerHTML += `RETRACTED${a.title}${a.publisher}`);
}

// Tools
document.getElementById('btn-check-doi').addEventListener('click', async () => {
    const doi = document.getElementById('doi-check').value.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '');
    const resBox = document.getElementById('doi-result'); resBox.innerHTML = "Checking...";
    try {
        const pubRes = await fetch(`https://pubpeer.com/v3/publications?dois=${doi}`); const pubData = await pubRes.json();
        if(pubData.feedbacks?.length>0) { resBox.innerHTML = `HIGH RISK: Flagged on PubPeer`; return; }
        resBox.innerHTML = "Checking Crossref...";
        const crRes = await fetch(`https://api.crossref.org/works/${doi}`); const crData = await crRes.json();
        if(crData.message.update?.some(u=>u.type==='retraction')) resBox.innerHTML = `RETRACTED via Crossref`;
        else resBox.innerHTML = `CLEAR`;
    } catch(e) { resBox.innerHTML = "Error checking DOI"; }
});

document.getElementById('btn-scan-text').addEventListener('click', () => {
    const text = document.getElementById('risk-text-input').value.toLowerCase();
    const resBox = document.getElementById('scan-results'); resBox.classList.remove('hidden');
    if(text.includes('counterfeit consciousness') || text.includes('colossal information') || text.includes('bosom malignant growth')) {
        resBox.innerHTML = `🚨 HIGH RISK: Tortured Phrases Detected (AI Generated Text)`;
    } else { resBox.innerHTML = `✅ No obvious AI tortured phrases found.`; }
});

loadData();

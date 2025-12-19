let rawData = [];
let uniqueCourses = new Set();

// CONFIG: Column Definitions
// We map the CSV column index to a display label
const slotsConfig = [
    { index: 3, label: "09:00 - 10:15" },
    { index: 4, label: "10:30 - 11:45" },
    { index: 5, label: "12:00 - 01:15" },
    { index: 7, label: "02:30 - 03:45" },
    { index: 8, label: "04:00 - 05:15" },
    { index: 9, label: "05:30 - 06:45" },
    { index: 10, label: "07:00 - 08:15" },
    { index: 11, label: "08:45 - 10:00" },
    { index: 12, label: "10:15 - 11:30" }
];

document.addEventListener('DOMContentLoaded', () => {
    Papa.parse("timetable.csv", {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: function(results) {
            console.log("CSV Loaded. Rows:", results.data.length);
            rawData = results.data;
            analyzeCourses(rawData);
        },
        error: function(err) {
            alert("Error loading CSV: " + err.message);
        }
    });
});

function analyzeCourses(rows) {
    // Pass 1: Just find all unique course names for the checkboxes
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Scan all slot columns
        slotsConfig.forEach(slot => {
            const cellData = row[slot.index];
            if (cellData && cellData.trim().length > 1) {
                const courseName = extractCourseName(cellData);
                if (courseName) uniqueCourses.add(courseName);
            }
        });
    }
    renderCheckboxes();
}

function extractCourseName(rawText) {
    // Logic: "BFSI A 1" -> "BFSI A"
    rawText = rawText.replace(/\s+/g, ' ').trim();
    if (rawText.toLowerCase().includes("registration")) return null;
    if (rawText.toLowerCase().includes("lunch")) return null;
    
    let parts = rawText.split(" ");
    // If last part is a number (Session ID), remove it
    if (parts.length > 1 && !isNaN(parts[parts.length - 1])) {
        parts.pop();
    }
    return parts.join(" ");
}

function renderCheckboxes() {
    const container = document.getElementById('checkbox-container');
    const loading = document.getElementById('loading');
    
    const sortedCourses = Array.from(uniqueCourses).sort();
    container.innerHTML = "";

    if (sortedCourses.length === 0) {
        loading.innerHTML = "No courses found. Check CSV format.";
        return;
    }

    sortedCourses.forEach(course => {
        const div = document.createElement('div');
        div.className = "flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer transition";
        div.innerHTML = `
            <input type="checkbox" id="${course}" value="${course}" class="w-5 h-5 text-indigo-600 rounded cursor-pointer">
            <label for="${course}" class="ml-3 text-sm font-medium text-gray-900 cursor-pointer w-full select-none">${course}</label>
        `;
        div.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
            }
        };
        container.appendChild(div);
    });

    loading.style.display = 'none';
    container.classList.remove('hidden');
}

function generateSchedule() {
    const checkboxes = document.querySelectorAll('#checkbox-container input[type="checkbox"]:checked');
    const selectedCourses = Array.from(checkboxes).map(cb => cb.value);

    if (selectedCourses.length === 0) {
        alert("Please select at least one course.");
        return;
    }

    // 1. Build the Data Map: Date -> Slot -> Content
    // We use a Map to merge multiple rows (rooms) into one Date entry
    const scheduleMap = new Map(); // Key: "YYYY-MM-DD", Value: { slotIndex: "Class Info" }

    let lastValidDate = null;

    for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        let dateStr = row[0];

        // Date Fill-Down Logic
        let formattedDate = null;
        if (dateStr && (dateStr.includes("-") || dateStr.includes("/"))) {
            formattedDate = normalizeDate(dateStr);
            lastValidDate = formattedDate;
        } else if (lastValidDate && hasData(row)) {
            formattedDate = lastValidDate;
        }

        if (!formattedDate) continue;

        const room = row[1] || "Unknown Room";

        // Check if we already have an entry for this date
        if (!scheduleMap.has(formattedDate)) {
            scheduleMap.set(formattedDate, {});
        }
        const dateEntry = scheduleMap.get(formattedDate);

        // Check columns
        slotsConfig.forEach(slot => {
            const cellData = row[slot.index];
            if (cellData && cellData.trim().length > 1) {
                const courseName = extractCourseName(cellData);
                
                // FILTER: Only show if it's in the selected list
                if (selectedCourses.includes(courseName)) {
                    // Found a match! Add to this slot
                    const displayText = `${cellData.trim()} <br> <span class="text-xs text-gray-500">(${room})</span>`;
                    
                    // If multiple classes in same slot (rare conflict), append
                    if (dateEntry[slot.index]) {
                        dateEntry[slot.index] += `<br><hr class="my-1 border-indigo-200">` + displayText;
                    } else {
                        dateEntry[slot.index] = displayText;
                    }
                }
            }
        });
    }

    renderTable(scheduleMap);
}

function renderTable(scheduleMap) {
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');

    // 1. Create Headers
    let headerHTML = `<th class="bg-indigo-100 text-indigo-900">Date</th>`;
    slotsConfig.forEach(slot => {
        headerHTML += `<th class="text-xs font-bold text-gray-600">${slot.label}</th>`;
    });
    tableHeader.innerHTML = headerHTML;

    // 2. Create Rows
    let bodyHTML = "";
    // Sort dates
    const sortedDates = Array.from(scheduleMap.keys()).sort();

    if (sortedDates.length === 0) {
        alert("No classes found for the selected courses.");
        return;
    }

    sortedDates.forEach(dateKey => {
        const dayData = scheduleMap.get(dateKey);
        
        // Skip days with no classes for this student? 
        // Or show them empty? Let's show only days with at least one class
        if (Object.keys(dayData).length === 0) return;

        // Format Date for display (e.g., "Mon, Dec 15")
        const dateObj = new Date(dateKey);
        const dateDisplay = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        let rowHTML = `<tr>`;
        rowHTML += `<td class="font-bold bg-gray-50 whitespace-nowrap">${dateDisplay}</td>`;

        slotsConfig.forEach(slot => {
            const content = dayData[slot.index] || "";
            const cellClass = content ? "cell-filled" : "";
            rowHTML += `<td class="${cellClass}">${content}</td>`;
        });

        rowHTML += `</tr>`;
        bodyHTML += rowHTML;
    });

    tableBody.innerHTML = bodyHTML;

    document.getElementById('selection-page').classList.add('hidden');
    document.getElementById('schedule-page').classList.remove('hidden');
}

function normalizeDate(str) {
    str = str.trim();
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
        if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return null;
}

function hasData(row) {
    for (let k = 3; k < 12; k++) {
        if (row[k] && row[k].trim().length > 1) return true;
    }
    return false;
}

function goBack() {
    document.getElementById('schedule-page').classList.add('hidden');
    document.getElementById('selection-page').classList.remove('hidden');
}

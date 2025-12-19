let allEvents = [];
let uniqueCourses = new Set();
let calendar;

// MAPPING: Time Slots (Columns 3-12)
const timeSlots = {
    3: { start: "09:00", end: "10:15" },
    4: { start: "10:30", end: "11:45" },
    5: { start: "12:00", end: "13:15" },
    // 6 is Lunch
    7: { start: "14:30", end: "15:45" },
    8: { start: "16:00", end: "17:15" },
    9: { start: "17:30", end: "18:45" },
    10: { start: "19:00", end: "20:15" },
    11: { start: "20:45", end: "22:00" },
    12: { start: "22:15", end: "23:30" }
};

document.addEventListener('DOMContentLoaded', () => {
    Papa.parse("timetable.csv", {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: function(results) {
            console.log("CSV Loaded. Rows:", results.data.length);
            processData(results.data);
        },
        error: function(err) {
            alert("Error loading CSV: " + err.message);
        }
    });
});

function processData(rows) {
    let lastValidDate = null;
    
    // Start scan from index 0
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let dateStr = row[0]; // First column

        // 1. DATE HANDLING (With "Fill Down" logic)
        let formattedDate = null;
        
        if (dateStr && (dateStr.includes("-") || dateStr.includes("/"))) {
            formattedDate = normalizeDate(dateStr);
            lastValidDate = formattedDate; 
        } else if (lastValidDate && hasData(row)) {
            // If date is missing but row has data, use previous date
            formattedDate = lastValidDate;
        }

        if (!formattedDate) continue; 

        const room = row[1]; 

        // 2. SCAN TIME COLUMNS
        for (const [colIndex, time] of Object.entries(timeSlots)) {
            const cellData = row[colIndex];
            
            if (cellData && cellData.trim().length > 1) {
                // Normalize spaces
                const rawText = cellData.replace(/\s+/g, ' ').trim();
                
                // Logic: "BFSI A 1" -> "BFSI A"
                let parts = rawText.split(" ");
                if (parts.length > 1 && !isNaN(parts[parts.length - 1])) {
                    parts.pop();
                }
                const courseIdentifier = parts.join(" ");

                if (courseIdentifier.toLowerCase().includes("registration")) continue;

                uniqueCourses.add(courseIdentifier);

                allEvents.push({
                    title: `${rawText} (${room})`,
                    start: `${formattedDate}T${time.start}:00`,
                    end: `${formattedDate}T${time.end}:00`,
                    extendedProps: { courseId: courseIdentifier }
                });
            }
        }
    }

    renderCheckboxes();
}

function normalizeDate(str) {
    str = str.trim();
    // Handle 15/12/2025 or 15-12-2025
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

function renderCheckboxes() {
    const container = document.getElementById('checkbox-container');
    const loading = document.getElementById('loading');
    
    if (uniqueCourses.size === 0) {
        loading.innerHTML = "No courses found. Check CSV format.";
        return;
    }

    const sortedCourses = Array.from(uniqueCourses).sort();
    container.innerHTML = "";

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

function showCalendar() {
    const checkboxes = document.querySelectorAll('#checkbox-container input[type="checkbox"]:checked');
    const selectedCourses = Array.from(checkboxes).map(cb => cb.value);

    if (selectedCourses.length === 0) {
        alert("Please select at least one course.");
        return;
    }

    const filteredEvents = allEvents.filter(event => 
        selectedCourses.includes(event.extendedProps.courseId)
    );
    
    if (filteredEvents.length === 0) {
        alert("0 classes found for this selection.");
        return;
    }

    // Switch View
    document.getElementById('selection-page').classList.add('hidden');
    document.getElementById('calendar-page').classList.remove('hidden');

    // FIX: Wait 50ms for the div to become visible before rendering calendar
    setTimeout(() => {
        initCalendar(filteredEvents);
    }, 50);
}

function goBack() {
    document.getElementById('calendar-page').classList.add('hidden');
    document.getElementById('selection-page').classList.remove('hidden');
}

function initCalendar(events) {
    const calendarEl = document.getElementById('calendar');
    
    // SMART JUMP: Find the date of the first event so we don't land on an empty month
    // Sort events by date to find the earliest
    events.sort((a, b) => new Date(a.start) - new Date(b.start));
    const firstEventDate = events[0].start.split('T')[0];

    if (calendar) {
        calendar.destroy(); // Completely reset calendar
    }

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        initialDate: firstEventDate, // <--- JUMP TO FIRST CLASS
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        events: events,
        height: 'auto',
        eventColor: '#4f46e5',
        nowIndicator: true,
        slotMinTime: "08:00:00",
        slotMaxTime: "23:00:00"
    });

    calendar.render();
}

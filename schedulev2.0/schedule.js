(() => {
    'use strict';

    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyv9_a5El6hxMICHFzfdSn3q2gdN39yeXA6hmtZK5aT4UmsCT0mARDNrwl0R3_OiKJ0LQ/exec';
    const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
    const RETRY_INTERVAL_MS = 60 * 1000;
    const MINIMUM_OPEN_SHIFT_MS = 2 * 60 * 60 * 1000;
    const DAY_OFFSET = Number.parseInt(document.body.dataset.dayOffset || '0', 10);
    const PAGE_LABEL = document.body.dataset.pageLabel || 'Schedule';

    const STATIONS = {
        '58': {
            requirements: ['Fire/EMS 1', 'Fire/EMS 2', 'Fire/EMS 3']
        },
        '72': {
            requirements: ['Fire/EMS 1', 'Fire/EMS 2']
        }
    };

    const VALID_COVERAGE = new Set([
        'Fire/EMS 1', 'Fire/EMS 2', 'Fire/EMS 3', 'Fire/EMS 4',
        'Fire/EMS 5', 'Fire/EMS 6', 'Fire/EMS 7', 'Fire/EMS 8',
        'EMS/Rider 1', 'EMS/Rider 2'
    ]);

    const POSITION_TRANSLATIONS = {
        'Pos ID: 1': 'Fire/EMS 1',
        'Pos ID: 2': 'Fire/EMS 2',
        'Pos ID: 3': 'Fire/EMS 3',
        'Pos ID: 45': 'Fire/EMS 4',
        'Pos ID: 9': 'Fire/EMS 5',
        'Pos ID: 56': 'EMS/Rider 1',
        'Pos ID: 5': 'Fire/EMS 6',
        'Pos ID: 6': 'Fire/EMS 7',
        'Pos ID: 7': 'Fire/EMS 8',
        'Pos ID: 57': 'EMS/Rider 2'
    };

    const dateLabel = document.getElementById('date-label');
    const syncCard = document.getElementById('sync-card');
    const syncLabel = document.getElementById('sync-label');
    const syncDetail = document.getElementById('sync-detail');
    const scheduleContainers = {
        '58': document.getElementById('sta58-schedule'),
        '72': document.getElementById('sta72-schedule')
    };

    let refreshTimer = null;
    let fetchInProgress = false;
    let hasRenderedData = false;

    function getTargetBounds() {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() + DAY_OFFSET);

        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        return { start, end };
    }

    function updatePageHeading(targetStart) {
        const formattedDate = targetStart.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });

        dateLabel.textContent = formattedDate;
        document.title = `${PAGE_LABEL} · Station Staffing Board`;
    }

    function setSyncState(state, label, detail) {
        syncCard.dataset.state = state;
        syncLabel.textContent = label;
        syncDetail.textContent = detail;
    }

    function stationForShift(shift) {
        const searchable = `${shift.schedule.name} ${shift.position.name}`.toLowerCase();
        if (searchable.includes('72')) return '72';
        if (searchable.includes('58')) return '58';
        return null;
    }

    function normalizeRecords(records) {
        if (!Array.isArray(records)) return [];

        return records.flatMap((record) => {
            const start = new Date(record?.start_time);
            const end = new Date(record?.end_time);
            if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
                return [];
            }

            const originalPosition = String(record?.position?.name || 'Position unavailable');
            const firstName = String(record?.member?.first_name || '').trim();
            const lastName = String(record?.member?.last_name || '').trim();

            return [{
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                member: {
                    first_name: firstName,
                    last_name: lastName
                },
                position: {
                    name: POSITION_TRANSLATIONS[originalPosition] || originalPosition
                },
                schedule: {
                    name: String(record?.schedule?.name || '')
                },
                is_open: false
            }];
        });
    }

    function generateOpenShifts(records, rangeStart, rangeEnd) {
        const openShifts = [];

        Object.entries(STATIONS).forEach(([station, configuration]) => {
            const stationShifts = records.filter((shift) => {
                const start = new Date(shift.start_time);
                const end = new Date(shift.end_time);
                return stationForShift(shift) === station && start < rangeEnd && end > rangeStart;
            });

            const boundaries = [rangeStart.getTime(), rangeEnd.getTime()];
            stationShifts.forEach((shift) => {
                const start = new Date(shift.start_time).getTime();
                const end = new Date(shift.end_time).getTime();
                if (start > rangeStart.getTime() && start < rangeEnd.getTime()) boundaries.push(start);
                if (end > rangeStart.getTime() && end < rangeEnd.getTime()) boundaries.push(end);
            });

            const uniqueBoundaries = [...new Set(boundaries)].sort((a, b) => a - b);

            for (let index = 0; index < uniqueBoundaries.length - 1; index += 1) {
                const blockStart = uniqueBoundaries[index];
                const blockEnd = uniqueBoundaries[index + 1];
                const coveringShifts = stationShifts.filter((shift) => {
                    const shiftStart = new Date(shift.start_time).getTime();
                    const shiftEnd = new Date(shift.end_time).getTime();
                    return shiftStart <= blockStart && shiftEnd >= blockEnd;
                });

                const missingPositions = [...configuration.requirements];
                let flexibleCoverage = 0;

                coveringShifts.forEach((shift) => {
                    const positionName = shift.position.name;
                    if (!VALID_COVERAGE.has(positionName)) return;

                    const exactPosition = missingPositions.indexOf(positionName);
                    if (exactPosition >= 0) {
                        missingPositions.splice(exactPosition, 1);
                    } else {
                        flexibleCoverage += 1;
                    }
                });

                while (flexibleCoverage > 0 && missingPositions.length > 0) {
                    missingPositions.shift();
                    flexibleCoverage -= 1;
                }

                missingPositions.forEach((positionName) => {
                    openShifts.push({
                        start_time: new Date(blockStart).toISOString(),
                        end_time: new Date(blockEnd).toISOString(),
                        member: { first_name: '', last_name: '' },
                        position: { name: positionName },
                        schedule: { name: station },
                        is_open: true
                    });
                });
            }
        });

        openShifts.sort((a, b) => {
            const stationOrder = a.schedule.name.localeCompare(b.schedule.name);
            if (stationOrder !== 0) return stationOrder;
            const positionOrder = a.position.name.localeCompare(b.position.name);
            if (positionOrder !== 0) return positionOrder;
            return new Date(a.start_time) - new Date(b.start_time);
        });

        const merged = [];
        openShifts.forEach((shift) => {
            const previous = merged.at(-1);
            const joinsPrevious = previous
                && previous.schedule.name === shift.schedule.name
                && previous.position.name === shift.position.name
                && new Date(previous.end_time).getTime() === new Date(shift.start_time).getTime();

            if (joinsPrevious) {
                previous.end_time = shift.end_time;
            } else {
                merged.push({
                    ...shift,
                    member: { ...shift.member },
                    position: { ...shift.position },
                    schedule: { ...shift.schedule }
                });
            }
        });

        const now = Date.now();
        return merged.filter((shift) => {
            const start = new Date(shift.start_time).getTime();
            const end = new Date(shift.end_time).getTime();
            return end - start >= MINIMUM_OPEN_SHIFT_MS && end > now;
        });
    }

    function formatShiftTime(value) {
        return new Date(value).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function createEmptyState(title, message) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';

        const text = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = title;
        const description = document.createElement('span');
        description.textContent = message;

        text.append(heading, description);
        emptyState.append(text);
        return emptyState;
    }

    function createShiftCard(shift) {
        const card = document.createElement('article');
        card.className = shift.is_open ? 'shift-card is-open' : 'shift-card';

        const startTime = formatShiftTime(shift.start_time);
        const endTime = formatShiftTime(shift.end_time);
        const time = document.createElement('time');
        time.className = 'shift-time';
        time.dateTime = shift.start_time;
        time.textContent = `${startTime} – ${endTime}`;

        const name = document.createElement('div');
        name.className = 'shift-name';
        const fullName = `${shift.member.first_name} ${shift.member.last_name}`.trim();
        name.textContent = shift.is_open ? 'OPEN SHIFT' : (fullName || 'Name unavailable');
        name.title = name.textContent;

        const position = document.createElement('div');
        position.className = 'shift-position';
        position.textContent = shift.position.name;

        card.setAttribute('aria-label', `${name.textContent}, ${position.textContent}, ${startTime} to ${endTime}`);
        card.append(time, name, position);
        return card;
    }

    function renderSchedule(records, rangeStart, rangeEnd) {
        const visibleRecords = records.filter((shift) => {
            const start = new Date(shift.start_time);
            const end = new Date(shift.end_time);
            return start < rangeEnd && end > rangeStart && (DAY_OFFSET > 0 || end.getTime() > Date.now());
        });
        const fullSchedule = [...visibleRecords, ...generateOpenShifts(records, rangeStart, rangeEnd)];

        Object.keys(STATIONS).forEach((station) => {
            const container = scheduleContainers[station];
            const panel = document.querySelector(`[data-station="${station}"]`);
            const summary = document.getElementById(`sta${station}-summary`);
            const stationRecords = fullSchedule
                .filter((shift) => stationForShift(shift) === station)
                .sort((a, b) => {
                    const timeOrder = new Date(a.start_time) - new Date(b.start_time);
                    if (timeOrder !== 0) return timeOrder;
                    return a.position.name.localeCompare(b.position.name);
                });

            const openCount = stationRecords.filter((shift) => shift.is_open).length;
            const assignedCount = stationRecords.length - openCount;

            container.replaceChildren();
            panel.dataset.alert = String(openCount > 0);
            summary.classList.toggle('has-open-shifts', openCount > 0);
            summary.textContent = openCount > 0
                ? `${openCount} open · ${assignedCount} assigned`
                : `${assignedCount} assigned · fully covered`;

            if (stationRecords.length === 0) {
                container.append(createEmptyState('No schedule entries', 'No assignments or open shifts were found for this date.'));
                return;
            }

            stationRecords.forEach((shift) => container.append(createShiftCard(shift)));
        });

        hasRenderedData = true;
    }

    function showInitialError() {
        Object.values(scheduleContainers).forEach((container) => {
            container.replaceChildren(createEmptyState('Schedule unavailable', 'The connection will retry automatically in one minute.'));
        });
    }

    function scheduleNextFetch(delay) {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(fetchScheduleData, delay);
    }

    async function fetchScheduleData() {
        if (fetchInProgress) return;
        fetchInProgress = true;

        const { start, end } = getTargetBounds();
        updatePageHeading(start);
        setSyncState('loading', hasRenderedData ? 'Refreshing schedule' : 'Connecting to schedule', hasRenderedData ? 'Keeping the last successful view visible' : 'Loading current staffing data');

        try {
            const requestUrl = new URL(WEB_APP_URL);
            requestUrl.searchParams.set('_', Date.now().toString());
            const response = await fetch(requestUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Schedule request failed with status ${response.status}`);

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            const records = normalizeRecords(data.records);
            renderSchedule(records, start, end);

            const updatedAt = new Date().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
            });
            setSyncState('live', 'Live schedule', `Updated ${updatedAt} · refreshes every 10 minutes`);
            scheduleNextFetch(REFRESH_INTERVAL_MS);
        } catch (error) {
            console.error('Unable to refresh the station schedule:', error);
            if (!hasRenderedData) showInitialError();
            setSyncState(hasRenderedData ? 'stale' : 'error', hasRenderedData ? 'Showing last update' : 'Connection unavailable', 'Retrying automatically in one minute');
            scheduleNextFetch(RETRY_INTERVAL_MS);
        } finally {
            fetchInProgress = false;
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') fetchScheduleData();
    });

    fetchScheduleData();
})();

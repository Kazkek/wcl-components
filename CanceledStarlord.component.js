let getComponent;

(() => {
    "use strict";

    // Utility functions
    const STARLORD_BUFF_ID = 279709;

    // Function to create an error component
    function createErrorComponent(title, message) {
        return {
            component: "EnhancedMarkdown",
            props: {
                content: `\n<u># ${title} Error</u>\n${message}\n`
            }
        };
    }

    // Function to compare object properties
    const hasDifferentProperties = (obj, filters) => {
        for (const filter of filters) {
            for (const key in filter) {
                if (obj[key] !== filter[key]) {
                    return true;
                }
            }
        }
        return false;
    };

    // BuffManager class to manage buffs and events
    class BuffManager {
        constructor(events, options = {}) {
            this.actors = {};

            for (const event of events) {
                // Skip invalid or irrelevant events
                if (!event.ability || !event.target || !event.source) continue;
                if (event.type.includes("stack")) continue;
                if (event.target.type === "Pet") continue;
                if (event.targetDisposition !== "friendly") continue;
                if (options.auraIds && !options.auraIds.has(event.ability.id)) continue;
                if (options.fight && options.fight.isEventExcludedFromDamageRankings(event)) continue;
                if (options.targetFilters && hasDifferentProperties(event.target, options.targetFilters)) continue;
                if (options.sourceFilters && hasDifferentProperties(event.source, options.sourceFilters)) continue;
                if (options.abilityFilters && hasDifferentProperties(event.ability, options.abilityFilters)) continue;

                // Create actors, targets, and buffs
                const sourceActor = new Actor(event.source.id);
                const targetActor = new Target(event.target.id);
                const buff = new Buff(event.ability.id);

                // Process buff application or removal
                if (event.type.includes("apply")) {
                    this.addActor(sourceActor)
                        .addTarget(targetActor)
                        .addBuff(buff)
                        .buffApplied(event, options.captureEvent);
                } else if (event.type.includes("remove")) {
                    this.addActor(sourceActor)
                        .addTarget(targetActor)
                        .addBuff(buff)
                        .buffRemoved(event, options.captureEvent);
                }
            }
        }

        addActor(actor) {
            if (!this.actors[actor.id]) {
                this.actors[actor.id] = actor;
            }
            return this.actors[actor.id];
        }

        getAurasBySourceActor(actorId) {
            return this.actors[actorId];
        }

        getSelfBuff(actorId, buffId) {
            return this.actors[actorId]?.targets[actorId]?.buffs[buffId];
        }
    }

    // Actor class to represent a source of events
    class Actor {
        constructor(id) {
            this.targets = {};
            this.id = id;
        }

        addTarget(target) {
            if (!this.targets[target.id]) {
                this.targets[target.id] = target;
            }
            return this.targets[target.id];
        }
    }

    // Target class to represent a target of events
    class Target {
        constructor(id) {
            this.buffs = {};
            this.id = id;
        }

        addBuff(buff) {
            if (!this.buffs[buff.id]) {
                this.buffs[buff.id] = buff;
            }
            return this.buffs[buff.id];
        }
    }

    // Buff class to manage buff application and removal
    class Buff {
        constructor(id) {
            this.applied = [];
            this.removed = [];
            this.events = {};
            this.id = id;
        }

        buffApplied(event, captureEvent = false) {
            this.applied.push(event.timestamp);
            if (captureEvent) {
                this.events[event.timestamp] = event;
            }
        }

        buffRemoved(event, captureEvent = false) {
            this.removed.push(event.timestamp);
            if (captureEvent) {
                this.events[event.timestamp] = event;
            }
        }

        get sortedTimeSpans() {
            if (this._sortedTimes) {
                return JSON.parse(JSON.stringify(this._sortedTimes));
            }

            // Remove duplicates and sort applied and removed timestamps
            this.applied = Array.from(new Set(this.applied));
            this.removed = Array.from(new Set(this.removed));

            while (this.applied.length < this.removed.length) {
                this.applied.unshift(0);
            }

            this.applied.sort((a, b) => a - b);

            while (this.removed.length < this.applied.length) {
                this.removed.push(Infinity);
            }

            this.removed.sort((a, b) => a - b);

            // Create sorted time spans
            this._sortedTimes = Array.from(
                Array(Math.max(this.applied.length, this.removed.length)),
                (_, index) => [this.applied[index] || 0, this.removed[index] || Infinity]
            );

            return JSON.parse(JSON.stringify(this._sortedTimes));
        }
    }

    // Debugging utility
    const debug = new class {
        constructor(debug) {
            this.messages = [];
            this.debug = debug;
        }

        addMessage(key, value) {
            if (!this.debug) return;
            const message = {};
            message[key] = value;
            this.messages.push(message);
        }
    }(false);

    // Main component function
    const CanceledStarlord = () => {
        const title = "Canceled Starlord";

        // Ensure a single fight is selected
        if (reportGroup.fights.length !== 1) {
            return createErrorComponent(title, "Please select a single fight");
        }

        const fight = reportGroup.fights[0];

        // Ensure a single Druid is selected
        if (fight.combatantInfoEvents.length !== 1) {
            return createErrorComponent(title, "Please select a single <Druid>");
        }

        const player = fight.combatantInfoEvents[0].source;

        if (!player || player.subType !== "Druid") {
            return createErrorComponent(title, "Please select a single <Druid>");
        }

        // Retrieve aura events
        const auraEvents = fight.eventsByCategoryAndDisposition("aurasGained", "friendly");

        // Create BuffManager instance
        const buffManager = new BuffManager(auraEvents, {
            sourceFilters: [{ idInReport: player.idInReport }],
            auraIds: new Set([STARLORD_BUFF_ID]),
            captureEvent: true
        });

        debug.addMessage("BuffManager", buffManager);

        // Ensure the player has the Starlord buff
        const playerBuff = buffManager.getSelfBuff(player.id, STARLORD_BUFF_ID);
        if (!playerBuff) {
            return [];
        }

        const timeSpans = playerBuff.sortedTimeSpans;
        let canceledCount = 0;
        const durations = [];

        // Analyze buff durations
        for (const [start, end] of timeSpans) {
            const duration = Math.round(end / 1000) - Math.round(start / 1000);
            const preciseDuration = end / 1000 - start / 1000;

            durations.push(preciseDuration);

            if (duration < 15 && duration > 1) {
                canceledCount++;
            }
        }

        debug.addMessage("Applications", timeSpans.length);
        debug.addMessage("Canceled", canceledCount);
        debug.addMessage("All Durations", durations);
        debug.addMessage("All Timings", timeSpans);

        // Return the result as a Markdown component
        return {
            component: "EnhancedMarkdown",
            props: {
                content: `
# <u>${title} for <Druid>${player.name}</Druid></u>
Detected Starlord applications: ${timeSpans.length}

Starlord canceled: ${canceledCount}
`
            }
        };
    };

    // Export the component
    globalThis.getComponent = getComponent = CanceledStarlord;
})();
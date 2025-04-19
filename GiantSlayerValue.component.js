let getComponent;

(() => {
    "use strict";

    // Utility functions
    function createErrorComponent(title, message) {
        return {
            component: "EnhancedMarkdown",
            props: {
                content: `\n<u># ${title} Error</u>\n${message}\n`
            }
        };
    }

    function hasDifferentProperties(obj, filters) {
        for (const filter of filters) {
            for (const key in filter) {
                if (obj[key] !== filter[key]) {
                    return true;
                }
            }
        }
        return false;
    }

    // Classes for processing buffs and events
    class BuffManager {
        constructor(events, options = {}) {
            this.actors = {};

            for (const event of events) {
                if (!event.ability || !event.target || !event.source) continue;
                if (event.type.includes("stack")) continue;
                if (event.target.type === "Pet") continue;
                if (event.targetDisposition !== "friendly") continue;
                if (options.auraIds && !options.auraIds.has(event.ability.id)) continue;
                if (options.fight && options.fight.isEventExcludedFromDamageRankings(event)) continue;
                if (options.targetFilters && hasDifferentProperties(event.target, options.targetFilters)) continue;
                if (options.sourceFilters && hasDifferentProperties(event.source, options.sourceFilters)) continue;
                if (options.abilityFilters && hasDifferentProperties(event.ability, options.abilityFilters)) continue;

                const sourceActor = new Actor(event.source.id);
                const targetActor = new Target(event.target.id);
                const buff = new Buff(event.ability.id);

                if (event.type.includes("apply")) {
                    this.addActor(sourceActor).addTarget(targetActor).addBuff(buff).buffApplied(event, options.captureEvent);
                } else if (event.type.includes("remove")) {
                    this.addActor(sourceActor).addTarget(targetActor).addBuff(buff).buffRemoved(event, options.captureEvent);
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

            this._sortedTimes = Array.from(
                Array(Math.max(this.applied.length, this.removed.length)),
                (_, index) => [this.applied[index] || 0, this.removed[index] || Infinity]
            );

            return JSON.parse(JSON.stringify(this._sortedTimes));
        }

        isTimeInTimeSpans(timestamp) {
            let left = 0;
            let right = this.sortedTimeSpans.length - 1;

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const [start, end] = this.sortedTimeSpans[mid];

                if (timestamp >= start && timestamp <= end) {
                    return true;
                }

                if (timestamp < start) {
                    right = mid - 1;
                } else {
                    left = mid + 1;
                }
            }

            return false;
        }

        getFullDuration(fight) {
            let totalDuration = 0;
            const timeSpans = this._sortedTimes || this.sortedTimeSpans;

            for (const [start, end] of timeSpans) {
                const adjustedStart = start ?? fight.startTime;
                const adjustedEnd = end ?? fight.endTime;
                totalDuration += adjustedEnd - adjustedStart;
            }

            return totalDuration;
        }
    }

    // Helper functions
    function getEventsByCategoryAndDisposition(fight, category, disposition) {
        return fight.eventsByCategoryAndDisposition(category, disposition);
    }

    // Debugging utility
    class Debugger {
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
    }

    const debug = new Debugger(false);

    // Main component
    const GiantSlayerValue = () => {
        const title = "Mastery: Giant Slayer Value";
        const masteryBuffId = 375087;
        const validAbilityIds = new Set([361500, 370452, 357212, 357209, 359077, 356995, 362969, 353759, 1, 368847, 382411]);
        const dragonRageAbilityId = 357210;

        if (reportGroup.fights.length !== 1) {
            return createErrorComponent(title, "Please select a single fight");
        }

        const fight = reportGroup.fights[0];

        if (fight.combatantInfoEvents.length === 0) {
            return createErrorComponent(title, "This component relies on real encounters and won't work with trash fights.");
        }

        if (fight.combatantInfoEvents.length !== 1) {
            return createErrorComponent(title, "Please select a single <Evoker>Devastation Evoker</Evoker>");
        }

        const player = fight.combatantInfoEvents[0].source;

        if (!player || fight.specForPlayer(player) !== "Devastation") {
            return createErrorComponent(title, "Please select a single <Evoker>Devastation Evoker</Evoker>");
        }

        // Process events and calculate mastery value
        const auraEvents = getEventsByCategoryAndDisposition(fight, "aurasGained", "friendly");
        const buffManager = new BuffManager(auraEvents, {
            sourceFilters: [{ idInReport: player.idInReport }],
            auraIds: new Set([masteryBuffId])
        });

        // Additional calculations and data processing...

        return {
            component: "EnhancedMarkdown",
            props: {
                content: `\n# <u>${title} for <Evoker>${player.name}</Evoker></u>\n...`
            }
        };
    };

    globalThis.getComponent = GiantSlayerValue;
})();
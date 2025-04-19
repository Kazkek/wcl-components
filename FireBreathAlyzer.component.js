let getComponent;

(() => {
    "use strict";

    // Utility function to compare object properties
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

        get appliedTimings() {
            return this.applied;
        }

        get removedTimings() {
            return this.removed;
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

    // Main component function
    const FireBreathAlyzer = () => {
        // Get events for the first fight
        const fight = reportGroup.fights[0];
        const events = fight.eventsByCategoryAndDisposition("aurasCast", "friendly");

        // Create a BuffManager instance
        return new BuffManager(events, {
            sourceFilters: [{ idInReport: 1 }]
        });
    };

    // Export the component
    globalThis.getComponent = getComponent = FireBreathAlyzer;
})();
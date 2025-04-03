export const RIDE_STATUSES = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

export const RIDE_STATUS_TRANSITIONS = {
    [RIDE_STATUSES.PENDING]: [RIDE_STATUSES.ACCEPTED, RIDE_STATUSES.CANCELLED],
    [RIDE_STATUSES.ACCEPTED]: [RIDE_STATUSES.IN_PROGRESS, RIDE_STATUSES.CANCELLED],
    [RIDE_STATUSES.IN_PROGRESS]: [RIDE_STATUSES.COMPLETED, RIDE_STATUSES.CANCELLED]
};

export const POPULATE_OPTIONS = {
    patient: {
        path: 'patient',
        select: 'firstName lastName phone',
        options: { strictPopulate: false }
    },
    driver: {
        path: 'driver',
        select: 'firstName lastName phone',
        options: { strictPopulate: false }
    },
    facility: {
        path: 'facility',
        select: 'facilityName phone address',
        options: { strictPopulate: false }
    }
}; 
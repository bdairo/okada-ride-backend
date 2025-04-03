# CareRide-Connect Backend

This is the backend application for CareRide-Connect, a platform connecting Non-EMT Transport Companies with Care Facilities for efficient medical transportation services.

## Technology Stack

- **Framework**: Express.js with NestJS components
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT-based authentication
- **Real-time Communication**: Socket.IO for real-time updates
- **Caching**: Redis for caching and rate limiting
- **Security**: Various middleware (helmet, cors, rate limiting)
- **Logging**: Winston for logging
- **Scheduling**: Node-cron for scheduled tasks
- **Payment Processing**: Square SDK integration

## Project Structure

- **controllers/**: Business logic for handling requests
- **models/**: Mongoose schemas and models
- **routes/**: API route definitions
- **middleware/**: Express middleware functions
- **config/**: Configuration files
- **tasks/**: Scheduled tasks and maintenance jobs
- **socket/**: Socket.IO configuration and event handlers

## Getting Started

To get started with the backend, follow these steps:

1. Clone this repository.
2. Navigate to the `backend` directory.
3. Create a `.env` file with the following variables:
   ```
   PORT=5010
   MONGODB_URI=mongodb://localhost:27017/careride
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRES_IN=90d
   FRONTEND_URL=http://localhost:5173
   REDIS_URL=redis://localhost:6379 (optional)
   SQUARE_ACCESS_TOKEN=your_square_access_token
   MAPBOX_API_KEY=your_mapbox_api_key
   ```
4. Run `npm install` to install the necessary dependencies.
5. Run `npm run dev` to start the development server.

## Available Scripts

- `npm run dev`: Starts the development server with nodemon
- `npm start`: Starts the server in production mode
- `npm run init-db`: Initializes the database with required collections
- `npm run seed`: Seeds the database with sample data
- `npm run calculate-fares`: Utility script to calculate missing fares
- `npm run lint`: Runs ESLint to check for code quality issues
- `npm test`: Runs the test suite

## API Endpoints

The backend provides the following main API endpoints:

### Authentication
- `POST /api/auth/register`: Register a new user
- `POST /api/auth/login`: Login a user
- `GET /api/auth/me`: Get current user profile

### Users
- `GET /api/users`: Get all users (admin only)
- `GET /api/users/:id`: Get a specific user
- `PUT /api/users/:id`: Update a user
- `DELETE /api/users/:id`: Delete a user

### Rides
- `POST /api/rides`: Create a new ride
- `GET /api/rides`: Get all rides
- `GET /api/rides/:id`: Get a specific ride
- `PUT /api/rides/:id`: Update a ride
- `DELETE /api/rides/:id`: Delete a ride
- `PATCH /api/rides/:id/status`: Update ride status

### Facilities
- `POST /api/facilities`: Create a new facility
- `GET /api/facilities`: Get all facilities
- `GET /api/facilities/:id`: Get a specific facility
- `PUT /api/facilities/:id`: Update a facility
- `DELETE /api/facilities/:id`: Delete a facility

### Patients
- `POST /api/patients`: Create a new patient
- `GET /api/patients`: Get all patients
- `GET /api/patients/:id`: Get a specific patient
- `PUT /api/patients/:id`: Update a patient
- `DELETE /api/patients/:id`: Delete a patient

## Socket.IO Events

The backend uses Socket.IO for real-time communication with the following events:

### Server to Client
- `newRide`: Emitted when a new ride is created
- `rideUpdate`: Emitted when a ride is updated
- `rideStatusChange`: Emitted when a ride status changes
- `message`: Emitted when a new message is sent

### Client to Server
- `joinRoom`: Join a specific room (ride, user)
- `leaveRoom`: Leave a specific room
- `sendMessage`: Send a message
- `updateLocation`: Update driver location

## Scheduled Tasks

The backend uses node-cron to schedule the following tasks:

- Daily cleanup of orphaned rides at midnight
- Periodic cleanup of expired tokens
- Regular database backups

## Contributing

We welcome contributions to the CareRide-Connect backend! If you're interested in contributing, please follow these steps:

1. Fork this repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them to your branch.
4. Push your branch to your forked repository.
5. Open a pull request in this repository with a detailed description of your changes.

## License

This project is licensed under the MIT License - see the [LICENSE.md](../LICENSE.md) file for details.

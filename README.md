# ClearSky Backend

## Overview

**ClearSky Backend** is the backend for an AI-powered voice agent platform that allows users to create unlimited custom assistants. This project integrates with **Twilio** to enable real-time voice communication, making it a versatile solution for various voice interaction use cases such as customer service bots, personal assistants, and more.

## Key Features

*   **AI Voice Agent**: Easily create custom AI-powered voice assistants.
*   **Unlimited Assistants**: The platform supports the creation of multiple unique assistants, each tailored to specific needs.
*   **Twilio Integration**: Seamless integration with Twilio for real-time voice call functionality.
*   **Real-time Voice Processing**: Supports real-time voice input and responses.
*   **Scalable Architecture**: Designed to scale and handle multiple concurrent voice streams.

- - -

## Development

### Prerequisites

Ensure you have the following installed on your machine:

*   **Node.js v22.0.0**
*   **Docker**
*   **Prisma** (For database management)
*   **Twilio Account** (for voice integration)

### Setup

1.  Clone the repository:
    
2.  Install dependencies:
    
    ```
    npm install
    ```
    
3.  Configure environment variables:
    
    Create a `.env` file at the root of your project and add your configurations (Twilio credentials, database URL, etc.):
    
    ```
    
    TWILIO_ACCOUNT_SID=your-twilio-account-sid
    TWILIO_AUTH_TOKEN=your-twilio-auth-token
    DATABASE_URL=your-database-url
            
    ```
    
4.  Generate Prisma Client:
    
    ```
    npx prisma generate
    ```
    
5.  Build the project:
    
    ```
    npm run build
    ```
    
6.  Start the development server:
    
    ```
    npm run dev
    ```
    
7.  Access the app at `http://localhost:8000`.

- - -

## Deployment

### Using Docker

1.  Build the Docker image:
    
    ```
    docker build -t clearsky-backend .
    ```
    
2.  Run the Docker container:
    
    ```
    docker run -p 8000:8000 clearsky-backend
    ```
    
3.  The app should now be running and accessible at `http://localhost:8000`.

### Production Environment

1.  Make sure the following environment variables are set for production:
    
    ```
    
    NODE_ENV=production
    PORT=8000
    DATABASE_URL=your-production-database-url
    TWILIO_ACCOUNT_SID=your-twilio-account-sid
    TWILIO_AUTH_TOKEN=your-twilio-auth-token
            
    ```
    
2.  In production, run the app with:
    
    ```
    npm start
    ```
    

### Prisma Migration (Optional)

If there are any new migrations or updates to the database schema:

```
npx prisma migrate deploy
```

- - -

## Additional Features & Roadmap

*   **NLP Integration**: Future plans include adding Natural Language Processing (NLP) capabilities for better voice understanding.
*   **Real-time Analytics**: Monitor voice interactions and assistant performance with detailed analytics dashboards (upcoming).

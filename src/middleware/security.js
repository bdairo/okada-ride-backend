import helmet from 'helmet';
import xss from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';

export const securityMiddleware = (app) => {
    // Set security HTTP headers
    app.use(helmet());

    // Data sanitization against XSS
    app.use(xss());

    // Data sanitization against NoSQL query injection
    app.use(mongoSanitize());

    // Additional security headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        next();
    });

    // Prevent parameter pollution
    app.use((req, res, next) => {
        if (req.query) {
            Object.keys(req.query).forEach(key => {
                if (Array.isArray(req.query[key])) {
                    req.query[key] = req.query[key][0];
                }
            });
        }
        next();
    });
}; 
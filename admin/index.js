const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const AdminJSMongoose = require('@adminjs/mongoose');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const Admin = require('../models/admin');
const Order = require('../models/order');

/*
 * AdminJS configuration
 *
 * This module configures and returns an Express router that mounts
 * AdminJS at the path specified by ADMIN_BASE_URL. Authentication
 * is handled via a custom function that checks the supplied
 * credentials against stored admin documents. Sessions are stored
 * in signed cookies using a secret defined in ADMIN_COOKIE_SECRET.
 */

// Register the Mongoose adapter once. Without this AdminJS will not
// know how to work with Mongoose models.
AdminJS.registerAdapter({ Database: AdminJSMongoose.Database, Resource: AdminJSMongoose.Resource });

function buildAdminRouter() {
  // Configure resources for the AdminJS dashboard. We hide sensitive
  // fields such as passwordHash and limit the ability to create or
  // delete records directly from the UI.
  const adminOptions = {
    resources: [
      {
        resource: Order,
        options: {
          properties: {
            _id: { isVisible: { list: true, filter: false, show: true, edit: false } },
            'customer.password': { isVisible: false },
            emailStatus: { isVisible: { list: true, filter: true, show: true, edit: false } },
            createdAt: { isVisible: { list: true, filter: true, show: true, edit: false } },
            updatedAt: { isVisible: { list: false, filter: false, show: true, edit: false } },
          },
          actions: {
            new: { isAccessible: false, isVisible: false },
            delete: { isAccessible: false, isVisible: false },
          },
        },
      },
      {
        resource: Admin,
        options: {
          properties: {
            passwordHash: { isVisible: false },
            createdAt: { isVisible: { list: true, filter: true, show: true, edit: false } },
          },
          actions: {
            new: {
              before: async (request) => {
                if (request.payload && request.payload.password) {
                  const hash = await bcrypt.hash(request.payload.password, 10);
                  request.payload = {
                    ...request.payload,
                    passwordHash: hash,
                  };
                  delete request.payload.password;
                }
                return request;
              },
            },
            edit: {
              before: async (request) => {
                if (request.payload && request.payload.password) {
                  const hash = await bcrypt.hash(request.payload.password, 10);
                  request.payload = {
                    ...request.payload,
                    passwordHash: hash,
                  };
                  delete request.payload.password;
                }
                return request;
              },
            },
            delete: { isAccessible: false, isVisible: false },
          },
        },
      },
    ],
    branding: {
      companyName: 'Sørgulen Industriservice',
      softwareBrothers: false,
    },
    rootPath: process.env.ADMIN_BASE_URL || '/admin',
  };

  const adminJs = new AdminJS(adminOptions);

  // Rate limit admin login attempts to mitigate brute force attacks
  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Build an authenticated router. The authenticate function
  // receives an email and password and returns the admin record if
  // valid. Otherwise it returns false which triggers a 401.
  const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
    adminJs,
    {
      authenticate: async (email, password) => {
        const user = await Admin.findOne({ email: email.toLowerCase().trim() });
        if (!user) return false;
        const match = await bcrypt.compare(password, user.passwordHash);
        return match ? user : false;
      },
      cookieName: 'adminjs',
      cookiePassword: process.env.ADMIN_COOKIE_SECRET || process.env.JWT_SECRET,
    },
    null,
    {
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
      },
    },
  );

  // Apply the rate limiter to all admin routes
  adminRouter.use(adminLimiter);

  return adminRouter;
}

module.exports = buildAdminRouter;
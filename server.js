require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// רשימת המשתמשים המורשים (נמצאת בשרת בלבד ואינה חשופה לדפדפן!)
// =========================================================================
const ALLOWED_USERS = {
    'חיה מושקא': '770',
    'שרה כהן': '1234',
    'רבקה לוי': '5678',
    'מנהל': '9999'
};

// Middleware - הגדלת נפח הבקשה ל-15MB כדי לאפשר העלאת קובצי PDF/תמונות/וורד
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// חיבור למסד הנתונים Neon (PostgreSQL) באמצעות Sequelize
if (!process.env.DATABASE_URL) {
    console.warn('⚠️ אזהרה: משתנה הסביבה DATABASE_URL לא מוגדר בקובץ .env או ב-Render!');
}

const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgres://localhost:5432/batmelech', {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    }
});

// הגדרת מודל (טבלה) למערך פעילות ב-Neon
const Activity = sequelize.define('Activity', {
    actNumber: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    date: {
        type: DataTypes.STRING,
        allowNull: false
    },
    group: {
        type: DataTypes.STRING,
        allowNull: false
    },
    leader: {
        type: DataTypes.STRING,
        allowNull: false
    },
    topic: {
        type: DataTypes.STRING,
        allowNull: false
    },
    topicReveal: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    game1: {
        type: DataTypes.JSONB,
        allowNull: false
    },
    part2: {
        type: DataTypes.JSONB,
        allowNull: false
    },
    extraParts: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    fileName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    fileData: {
        type: DataTypes.TEXT, // שומר את הקובץ המלא בפורמט Base64 (Data URL)
        allowNull: true
    }
}, {
    tableName: 'activities',
    timestamps: true
});

// ==================== נתיבי API ====================

// 1. אימות התחברות מול רשימת המשתמשים שבשרת
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'נא להזין שם וקוד' });
    }

    const cleanName = username.trim();
    const cleanPass = password.trim();

    if (ALLOWED_USERS[cleanName] && ALLOWED_USERS[cleanName] === cleanPass) {
        return res.json({ success: true, leaderName: cleanName });
    }

    return res.status(401).json({ error: 'שם המשתמש או הקוד שגויים' });
});

// 2. שליפת כל מערכי הפעילות
app.get('/api/activities', async (req, res) => {
    try {
        const activities = await Activity.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.json(activities);
    } catch (error) {
        console.error('Error fetching activities:', error);
        res.status(500).json({ error: 'שגיאה בשליפת מערכי הפעילות מהשרת' });
    }
});

// 3. שמירת מערך פעילות חדש (כולל הקובץ המצורף)
app.post('/api/activities', async (req, res) => {
    try {
        const {
            actNumber,
            date,
            group,
            leader,
            topic,
            topicReveal,
            game1,
            part2,
            extraParts,
            fileName,
            fileData
        } = req.body;

        const newActivity = await Activity.create({
            actNumber,
            date,
            group,
            leader,
            topic,
            topicReveal,
            game1,
            part2,
            extraParts: extraParts || [],
            fileName: fileName || null,
            fileData: fileData || null
        });

        res.status(201).json(newActivity);
    } catch (error) {
        console.error('Error creating activity:', error);
        res.status(500).json({ error: 'שגיאה בשמירת מערך הפעילות במסד הנתונים' });
    }
});

// 4. מחיקת מערך פעילות לפי ID
app.delete('/api/activities/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCount = await Activity.destroy({ where: { id } });

        if (deletedCount === 0) {
            return res.status(404).json({ error: 'מערך הפעילות לא נמצא' });
        }
        res.json({ message: 'נמחק בהצלחה' });
    } catch (error) {
        console.error('Error deleting activity:', error);
        res.status(500).json({ error: 'שגיאה במחיקת מערך הפעילות' });
    }
});

// הגשת דף ה-HTML הראשי עבור כל נתיב אחר
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// סנכרון מול Neon והפעלת השרת
async function startServer() {
    try {
        await sequelize.authenticate();
        console.log('✅ התחברות למסד הנתונים Neon (PostgreSQL) הצליחה!');
        await sequelize.sync({ alter: true }); // מעדכן את הטבלה ומוסיף את עמודת fileData אוטומטית
        console.log('✅ טבלת activities מסונכרנת ומוכנה.');
    } catch (error) {
        console.error('❌ שגיאה בהתחברות ל-Neon:', error.message);
    }

    app.listen(PORT, () => {
        console.log(`🚀 השרת פועל בכתובת: http://localhost:${PORT}`);
    });
}

startServer();

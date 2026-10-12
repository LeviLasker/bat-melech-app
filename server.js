require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// חיבור למסד הנתונים Neon (PostgreSQL) באמצעות Sequelize
if (!process.env.DATABASE_URL) {
    console.warn('⚠️ אזהרה: משתנה הסביבה DATABASE_URL לא מוגדר!');
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
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'activities',
    timestamps: true
});

// =========================================================================
// הגדרת שליחת מייל אוטומטי למנהל (Nodemailer)
// =========================================================================
const mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // כתובת ה-Gmail שממנה נשלח המייל
        pass: process.env.EMAIL_PASS  // סיסמת אפליקציה של Gmail (16 תווים)
    }
});

async function sendAdminEmail(activity, req) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.ADMIN_EMAIL) {
        console.log('ℹ️ פרטי מייל לא הוגדרו במשתני הסביבה - מדלג על שליחת מייל.');
        return;
    }

    try {
        // בניית קישור מלא לאתר ב-Render ולצפייה/הורדת הקובץ
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fileUrl = activity.fileName ? `${baseUrl}/api/activities/${activity.id}/file` : null;

        // עיצוב החלקים הנוספים במידה ויש
        const extraPartsHtml = (activity.extraParts && activity.extraParts.length > 0)
            ? activity.extraParts.map((part, idx) => `
                <div style="background:#f8f5fc; padding:10px; border-radius:6px; margin-top:8px; border-right:3px solid #7b2cbf;">
                    <strong>חלק נוסף ${idx + 1}:</strong> ${part.title}<br>
                    <strong>מסר:</strong> ${part.message} | <strong>זמן:</strong> ${part.duration}
                </div>
            `).join('')
            : '<p>לא נוספו חלקים נוספים.</p>';

        // קישור לקובץ בגוף המייל
        const fileLinkHtml = fileUrl
            ? `<p style="margin-top:15px;">
                 📎 <strong>קובץ מצורף (${activity.fileName}):</strong><br>
                 <a href="${fileUrl}" style="display:inline-block; margin-top:6px; background:#7b2cbf; color:#ffffff; padding:8px 16px; border-radius:6px; text-decoration:none; font-weight:bold;">
                    לחץ כאן לצפייה / הורדת הקובץ מהאתר
                 </a>
                 <br><small>(הקובץ מצורף גם ישירות למייל זה)</small>
               </p>`
            : '<p><strong>קובץ מצורף:</strong> לא צורף קובץ למערך זה.</p>';

        // צירוף הקובץ גם כ-Attachment ישיר למייל
        const attachments = [];
        if (activity.fileName && activity.fileData && activity.fileData.includes('base64,')) {
            const base64Content = activity.fileData.split('base64,')[1];
            attachments.push({
                filename: activity.fileName,
                content: base64Content,
                encoding: 'base64'
            });
        }

        const mailOptions = {
            from: `"מערכת בת מלך כפר סבא" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `👑 מערך פעילות חדש הועלה! | ${activity.group} - פעילות מס' ${activity.actNumber} (${activity.leader})`,
            html: `
                <div dir="rtl" style="font-family: Arial, sans-serif; color: #2b2d42; line-height: 1.6; max-width: 650px; border: 1px solid #e0d4f5; border-radius: 10px; padding: 20px;">
                    <h2 style="color: #5a189a; margin-top: 0;">התקבל מערך פעילות חדש בסניף! 🎉</h2>
                    <p><strong>מדריכה:</strong> ${activity.leader} | <strong>שכבה:</strong> ${activity.group} | <strong>תאריך:</strong> ${activity.date}</p>
                    <hr style="border: none; border-top: 1px solid #e0d4f5;">
                    
                    <h3 style="color: #7b2cbf;">פעילות מספר ${activity.actNumber}: ${activity.topic}</h3>
                    <div style="background: #fffbeb; padding: 10px; border-radius: 6px; border: 1px solid #fde68a;">
                        <strong>💡 איך מסבירים ומגלים את הנושא:</strong><br>
                        ${activity.topicReveal}
                    </div>

                    <div style="background: #f8f5fc; padding: 10px; border-radius: 6px; margin-top: 10px; border-right: 4px solid #7b2cbf;">
                        <strong>🎲 חלק 1 - משחק:</strong> ${activity.game1?.description}<br>
                        <strong>🎯 מסר מהמשחק:</strong> ${activity.game1?.message} | <strong>⏱️ זמן:</strong> ${activity.game1?.duration}
                    </div>

                    <div style="background: #f8f5fc; padding: 10px; border-radius: 6px; margin-top: 10px; border-right: 4px solid #7b2cbf;">
                        <strong>🎨 חלק 2 - משחק / יצירה / סיפור:</strong> ${activity.part2?.description}<br>
                        <strong>🎯 מסר:</strong> ${activity.part2?.message} | <strong>⏱️ זמן:</strong> ${activity.part2?.duration}
                    </div>

                    <h4 style="margin-bottom: 5px; color: #5a189a;">חלקים נוספים:</h4>
                    ${extraPartsHtml}

                    <hr style="border: none; border-top: 1px solid #e0d4f5; margin-top: 15px;">
                    ${fileLinkHtml}
                </div>
            `,
            attachments: attachments
        };

        await mailTransporter.sendMail(mailOptions);
        console.log(`📧 נשלח מייל עדכון למנהל עבור מערך פעילות מס' ${activity.actNumber}`);
    } catch (error) {
        console.error('❌ שגיאה בשליחת מייל למנהל:', error.message);
    }
}

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

// 3. נתיב ייעודי לקישור ישיר לקובץ (עבור הקישור שבמייל)
app.get('/api/activities/:id/file', async (req, res) => {
    try {
        const activity = await Activity.findByPk(req.params.id);
        if (!activity || !activity.fileData) {
            return res.status(404).send('הקובץ המבוקש לא נמצא');
        }

        const matches = activity.fileData.match(/^data:(.+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).send('פורמט קובץ לא תקין');
        }

        const mimeType = matches[1];
        const fileBuffer = Buffer.from(matches[2], 'base64');

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(activity.fileName || 'file')}"`);
        res.send(fileBuffer);
    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).send('שגיאה בטעינת הקובץ');
    }
});

// 4. שמירת מערך פעילות חדש + שליחת מייל למנהל
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

        // שליחת המייל למנהל ברקע מבלי לעכב את המדריכה באתר
        sendAdminEmail(newActivity, req);

        res.status(201).json(newActivity);
    } catch (error) {
        console.error('Error creating activity:', error);
        res.status(500).json({ error: 'שגיאה בשמירת מערך הפעילות במסד הנתונים' });
    }
});

// 5. מחיקת מערך פעילות לפי ID
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
        await sequelize.sync({ alter: true });
        console.log('✅ טבלת activities מסונכרנת ומוכנה.');
    } catch (error) {
        console.error('❌ שגיאה בהתחברות ל-Neon:', error.message);
    }

    app.listen(PORT, () => {
        console.log(`🚀 השרת פועל בכתובת: http://localhost:${PORT}`);
    });
}

startServer();

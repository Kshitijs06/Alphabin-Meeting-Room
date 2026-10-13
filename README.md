# Alphabin-Meeting-Room
Step 1: Open a terminal.

Step 2: Go into the project folder. For example: cd meeting-rooms

Step 3: Start the server by typing: node server.js

Step 4: You should see a message like: Meeting Room Booking server running at http://localhost:3000

Step 5: Open your web browser and go to: http://localhost:3000

The app should now be visible and working.

How to use the app:

- Choose a room from the dropdown (Alpha, Beta or Gamma).
- Choose a date.
- Choose a start time and an end time.
- Type your name in the "Booked by" field.
- Click the "Book" button.
- If the booking is successful, you will see a success message and it will appear in the schedule on the right side.
- If the booking is not allowed (for example, the room is already booked at that time), you will see an error message explaining why.
- To cancel a booking, find it in the schedule list and click the "Cancel" button next to it.
- The "Free slots" section shows the open time gaps for each room on the date you picked, so you can see what is available before booking.
  
   Rules the system follows:

• The room must be one of Alpha, Beta or Gamma. Anything else gives an error.
• All fields (room, date, start time, end time, name) are required. The end time must be after the start time. Bookings can only be made between 09:00 and 18:00     (office hours).
• Bookings must start and end in steps of 15 minutes, for example 10:00, 10:15, 10:30, and so on.
• Two bookings cannot overlap for the same room on the same date. However, back-to-back bookings are allowed. For example, one booking from 10:00 to 11:00 and       another from 11:00 to 12:00 in the same room is allowed, because they do not actually overlap.
• If you try to cancel a booking that does not exist, you will get an error.

-- Simple API list (for reference)
GET /api/rooms Returns the list of rooms.
POST /api/bookings Creates a new booking. You send room, date, start time, end time and name.
GET /api/bookings?date=YYYY-MM-DD Returns all bookings for a given date, sorted by start time.
DELETE /api/bookings/:id Cancels (deletes) a booking by its id.
GET /api/rooms/:room/free?date=YYYY-MM-DD Returns the free time slots for a room on a given date.

Notes -
Since storage is in memory, restarting the server clears all bookings. This is fine for learning and demo purposes.
This project does not need a database or any installation steps, which makes it easy to run and explain.

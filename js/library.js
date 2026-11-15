// Built-in exercise list. Format: name | type | equipment | muscle
// Types: weight (kg x reps), bw (bodyweight reps), wbw (bodyweight + added kg),
//        abw (bodyweight - assistance), time (duration), dist (distance + time)
const RAW = `
Bench Press|weight|barbell|chest
Incline Bench Press|weight|barbell|chest
Decline Bench Press|weight|barbell|chest
Close-Grip Bench Press|weight|barbell|triceps
Bench Press (Dumbbell)|weight|dumbbell|chest
Incline Bench Press (Dumbbell)|weight|dumbbell|chest
Decline Bench Press (Dumbbell)|weight|dumbbell|chest
Bench Press (Smith Machine)|weight|machine|chest
Incline Bench Press (Smith Machine)|weight|machine|chest
Chest Press (Machine)|weight|machine|chest
Incline Chest Press (Machine)|weight|machine|chest
Chest Fly (Dumbbell)|weight|dumbbell|chest
Incline Chest Fly (Dumbbell)|weight|dumbbell|chest
Chest Fly (Machine)|weight|machine|chest
Cable Crossover|weight|cable|chest
Low-to-High Cable Fly|weight|cable|chest
Push-Up|wbw|bodyweight|chest
Dip|wbw|bodyweight|chest
Dip (Assisted)|abw|machine|chest
Pull-Up|wbw|bodyweight|back
Chin-Up|wbw|bodyweight|back
Neutral-Grip Pull-Up|wbw|bodyweight|back
Pull-Up (Assisted)|abw|machine|back
Lat Pulldown|weight|cable|back
Close-Grip Lat Pulldown|weight|cable|back
Neutral-Grip Lat Pulldown|weight|cable|back
Straight-Arm Pulldown|weight|cable|back
Lat Pulldown (Machine)|weight|machine|back
Bent-Over Row|weight|barbell|back
Pendlay Row|weight|barbell|back
T-Bar Row|weight|barbell|back
Dumbbell Row|weight|dumbbell|back
Chest-Supported Row (Dumbbell)|weight|dumbbell|back
Seated Cable Row|weight|cable|back
Seated Row (Machine)|weight|machine|back
Chest-Supported Row (Machine)|weight|machine|back
Single-Arm Cable Row|weight|cable|back
Inverted Row|wbw|bodyweight|back
Deadlift|weight|barbell|back
Sumo Deadlift|weight|barbell|glutes
Rack Pull|weight|barbell|back
Trap Bar Deadlift|weight|barbell|quads
Back Extension|wbw|bodyweight|back
Good Morning|weight|barbell|hamstrings
Shrug|weight|barbell|back
Shrug (Dumbbell)|weight|dumbbell|back
Face Pull|weight|cable|shoulders
Overhead Press|weight|barbell|shoulders
Push Press|weight|barbell|shoulders
Seated Overhead Press|weight|barbell|shoulders
Shoulder Press (Dumbbell)|weight|dumbbell|shoulders
Arnold Press|weight|dumbbell|shoulders
Shoulder Press (Machine)|weight|machine|shoulders
Shoulder Press (Smith Machine)|weight|machine|shoulders
Lateral Raise (Dumbbell)|weight|dumbbell|shoulders
Lateral Raise (Cable)|weight|cable|shoulders
Lateral Raise (Machine)|weight|machine|shoulders
Front Raise (Dumbbell)|weight|dumbbell|shoulders
Front Raise (Cable)|weight|cable|shoulders
Reverse Fly (Dumbbell)|weight|dumbbell|shoulders
Reverse Fly (Machine)|weight|machine|shoulders
Reverse Fly (Cable)|weight|cable|shoulders
Upright Row|weight|barbell|shoulders
Barbell Curl|weight|barbell|biceps
EZ-Bar Curl|weight|barbell|biceps
Dumbbell Curl|weight|dumbbell|biceps
Hammer Curl|weight|dumbbell|biceps
Incline Dumbbell Curl|weight|dumbbell|biceps
Concentration Curl|weight|dumbbell|biceps
Preacher Curl|weight|barbell|biceps
Preacher Curl (Machine)|weight|machine|biceps
Cable Curl|weight|cable|biceps
Bayesian Curl|weight|cable|biceps
Spider Curl|weight|dumbbell|biceps
Biceps Curl (Machine)|weight|machine|biceps
Triceps Pushdown|weight|cable|triceps
Triceps Rope Pushdown|weight|cable|triceps
Overhead Triceps Extension (Cable)|weight|cable|triceps
Overhead Triceps Extension (Dumbbell)|weight|dumbbell|triceps
Skull Crusher|weight|barbell|triceps
Skull Crusher (Dumbbell)|weight|dumbbell|triceps
Triceps Kickback|weight|dumbbell|triceps
Triceps Dip (Machine)|weight|machine|triceps
Triceps Extension (Machine)|weight|machine|triceps
Bench Dip|wbw|bodyweight|triceps
Diamond Push-Up|wbw|bodyweight|triceps
JM Press|weight|barbell|triceps
Wrist Curl|weight|barbell|forearms
Reverse Wrist Curl|weight|barbell|forearms
Reverse Curl|weight|barbell|forearms
Farmer's Walk|weight|dumbbell|forearms
Dead Hang|time|bodyweight|forearms
Squat|weight|barbell|quads
Front Squat|weight|barbell|quads
Pause Squat|weight|barbell|quads
Box Squat|weight|barbell|quads
Squat (Smith Machine)|weight|machine|quads
Goblet Squat|weight|dumbbell|quads
Hack Squat|weight|machine|quads
Pendulum Squat|weight|machine|quads
Leg Press|weight|machine|quads
Single-Leg Press|weight|machine|quads
Leg Extension|weight|machine|quads
Bulgarian Split Squat|weight|dumbbell|quads
Lunge (Dumbbell)|weight|dumbbell|quads
Lunge (Barbell)|weight|barbell|quads
Walking Lunge|weight|dumbbell|quads
Step-Up|weight|dumbbell|quads
Sissy Squat|wbw|bodyweight|quads
Pistol Squat|wbw|bodyweight|quads
Bodyweight Squat|bw|bodyweight|quads
Romanian Deadlift|weight|barbell|hamstrings
Romanian Deadlift (Dumbbell)|weight|dumbbell|hamstrings
Stiff-Leg Deadlift|weight|barbell|hamstrings
Single-Leg Romanian Deadlift|weight|dumbbell|hamstrings
Lying Leg Curl|weight|machine|hamstrings
Seated Leg Curl|weight|machine|hamstrings
Nordic Curl|wbw|bodyweight|hamstrings
Glute-Ham Raise|wbw|bodyweight|hamstrings
Hip Thrust|weight|barbell|glutes
Hip Thrust (Machine)|weight|machine|glutes
Glute Bridge|weight|barbell|glutes
Cable Kickback|weight|cable|glutes
Hip Abduction (Machine)|weight|machine|glutes
Hip Adduction (Machine)|weight|machine|glutes
Cable Pull-Through|weight|cable|glutes
Standing Calf Raise|weight|machine|calves
Seated Calf Raise|weight|machine|calves
Calf Press (Leg Press)|weight|machine|calves
Calf Raise (Smith Machine)|weight|machine|calves
Single-Leg Calf Raise|wbw|bodyweight|calves
Tibialis Raise|weight|machine|calves
Crunch|wbw|bodyweight|abs
Cable Crunch|weight|cable|abs
Crunch (Machine)|weight|machine|abs
Sit-Up|wbw|bodyweight|abs
Hanging Leg Raise|bw|bodyweight|abs
Hanging Knee Raise|bw|bodyweight|abs
Captain's Chair Leg Raise|bw|bodyweight|abs
Lying Leg Raise|bw|bodyweight|abs
Ab Wheel Rollout|bw|bodyweight|abs
Russian Twist|weight|dumbbell|abs
Cable Woodchopper|weight|cable|abs
Pallof Press|weight|cable|abs
Plank|time|bodyweight|abs
Side Plank|time|bodyweight|abs
L-Sit|time|bodyweight|abs
Toes-to-Bar|bw|bodyweight|abs
Dragon Flag|bw|bodyweight|abs
Muscle-Up|wbw|bodyweight|back
Kettlebell Swing|weight|kettlebell|glutes
Turkish Get-Up|weight|kettlebell|full body
Clean|weight|barbell|full body
Power Clean|weight|barbell|full body
Clean and Jerk|weight|barbell|full body
Snatch|weight|barbell|full body
Thruster|weight|barbell|full body
Burpee|bw|bodyweight|full body
Sled Push|weight|other|full body
Band Pull-Apart|bw|band|shoulders
Landmine Press|weight|barbell|shoulders
Cable External Rotation|weight|cable|shoulders
Running|dist|other|cardio
Treadmill|dist|machine|cardio
Cycling|dist|other|cardio
Stationary Bike|dist|machine|cardio
Rowing Machine|dist|machine|cardio
Elliptical|dist|machine|cardio
Stair Climber|time|machine|cardio
Jump Rope|time|other|cardio
Swimming|dist|other|cardio
Walking|dist|other|cardio
`;

export const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Muscle groups every install starts with. The user can rename, recolour, add and delete them. */
export const DEFAULT_GROUPS = [
  ['chest', 'Chest', 'green'], ['back', 'Back', 'orange'], ['shoulders', 'Shoulders', 'yellow'], ['arms', 'Arms', 'pink'],
  ['quads', 'Quads', 'red'], ['hamstrings', 'Hamstrings', 'blue'], ['glutes', 'Glutes', 'magenta'], ['calves', 'Calves', 'violet'],
  ['abs', 'Abs', 'teal'], ['cardio', 'Cardio', 'cyan'],
].map(([id, name, color]) => ({ id, name, color }));
/** Muscle tag of the list above -> group id. Full-body lifts start without a group. */
export const toGroup = muscle => ({ biceps: 'arms', triceps: 'arms', forearms: 'arms', 'full body': null })[muscle] ?? (DEFAULT_GROUPS.some(g => g.id === muscle) ? muscle : null);

export const LIBRARY = RAW.trim().split('\n').map(line => {
  const [name, type, equip, muscle] = line.split('|');
  return { id: 'lib-' + slug(name), name, type, equip, group: toGroup(muscle), notes: '', builtin: true };
});

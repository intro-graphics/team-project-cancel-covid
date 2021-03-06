import {defs, tiny} from './examples/common.js';

// Pull these names into this module's scope for convenience:
const {Vector, Vector3, vec, vec3, vec4, color, hex_color, Matrix, Mat4,
    Light, Shape, Material, Shader, Texture, Scene} = tiny;

// Types of walls
const R = 0;
const F = 1;
const N = 2;
const S = 3;
const W = 4;
const E = 5;
const U = -1;

export class Shape_From_File extends Shape {                                   // **Shape_From_File** is a versatile standalone Shape that imports
                                                                               // all its arrays' data from an .obj 3D model file.
    constructor(filename) {
        super("position", "normal", "texture_coord");
        // Begin downloading the mesh. Once that completes, return
        // control to our parse_into_mesh function.
        this.load_file(filename);
    }

    load_file(filename) {                             // Request the external file and wait for it to load.
        // Failure mode:  Loads an empty shape.
        return fetch(filename)
            .then(response => {
                if (response.ok) return Promise.resolve(response.text())
                else return Promise.reject(response.status)
            })
            .then(obj_file_contents => this.parse_into_mesh(obj_file_contents))
            .catch(error => {
                this.copy_onto_graphics_card(this.gl);
            })
    }

    parse_into_mesh(data) {                           // Adapted from the "webgl-obj-loader.js" library found online:
        var verts = [], vertNormals = [], textures = [], unpacked = {};

        unpacked.verts = [];
        unpacked.norms = [];
        unpacked.textures = [];
        unpacked.hashindices = {};
        unpacked.indices = [];
        unpacked.index = 0;

        var lines = data.split('\n');

        var VERTEX_RE = /^v\s/;
        var NORMAL_RE = /^vn\s/;
        var TEXTURE_RE = /^vt\s/;
        var FACE_RE = /^f\s/;
        var WHITESPACE_RE = /\s+/;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            var elements = line.split(WHITESPACE_RE);
            elements.shift();

            if (VERTEX_RE.test(line)) verts.push.apply(verts, elements);
            else if (NORMAL_RE.test(line)) vertNormals.push.apply(vertNormals, elements);
            else if (TEXTURE_RE.test(line)) textures.push.apply(textures, elements);
            else if (FACE_RE.test(line)) {
                var quad = false;
                for (var j = 0, eleLen = elements.length; j < eleLen; j++) {
                    if (j === 3 && !quad) {
                        j = 2;
                        quad = true;
                    }
                    if (elements[j] in unpacked.hashindices)
                        unpacked.indices.push(unpacked.hashindices[elements[j]]);
                    else {
                        var vertex = elements[j].split('/');

                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 0]);
                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 1]);
                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 2]);

                        if (textures.length) {
                            unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * 2 + 0]);
                            unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * 2 + 1]);
                        }

                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 0]);
                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 1]);
                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 2]);

                        unpacked.hashindices[elements[j]] = unpacked.index;
                        unpacked.indices.push(unpacked.index);
                        unpacked.index += 1;
                    }
                    if (j === 3 && quad) unpacked.indices.push(unpacked.hashindices[elements[0]]);
                }
            }
        }
        {
            const {verts, norms, textures} = unpacked;
            for (var j = 0; j < verts.length / 3; j++) {
                this.arrays.position.push(vec3(verts[3 * j], verts[3 * j + 1], verts[3 * j + 2]));
                this.arrays.normal.push(vec3(norms[3 * j], norms[3 * j + 1], norms[3 * j + 2]));
                this.arrays.texture_coord.push(vec(textures[2 * j], textures[2 * j + 1]));
            }
            this.indices = unpacked.indices;
        }
        this.normalize_positions(false);
        this.ready = true;
    }

    draw(context, program_state, model_transform, material) {               // draw(): Same as always for shapes, but cancel all
        // attempts to draw the shape before it loads:
        if (this.ready)
            super.draw(context, program_state, model_transform, material);
    }
}

export class Body {
    // **Body** can store and update the properties of a 3D body that incrementally
    // moves from its previous place due to velocities.  It conforms to the
    // approach outlined in the "Fix Your Timestep!" blog post by Glenn Fiedler.
    constructor(shape, material, size, temporary, debris, duration) {
        Object.assign(this,
            {shape, material, size, temporary, debris, duration})
    }

    // (within some margin of distance).
    static intersect_cube(p, margin = 0) {
        return p.every(value => value >= -1 - margin && value <= 1 + margin)
    }

    static intersect_sphere(p, margin = 0) {
        return p.dot(p) < 1 + margin;
    }

    emplace(location_matrix, linear_velocity, angular_velocity, spin_axis = vec3(0, 0, 0).randomized(1).normalized()) {                               // emplace(): assign the body's initial values, or overwrite them.
        this.center = location_matrix.times(vec4(0, 0, 0, 1)).to3();
        this.rotation = Mat4.translation(...this.center.times(-1)).times(location_matrix);
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // drawn_location gets replaced with an interpolated quantity:
        this.drawn_location = location_matrix;
        this.temp_matrix = Mat4.identity();
        return Object.assign(this, {linear_velocity, angular_velocity, spin_axis})
    }

    advance(time_amount) {
        // advance(): Perform an integration (the simplistic Forward Euler method) to
        // advance all the linear and angular velocities one time-step forward.
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // Apply the velocities scaled proportionally to real time (time_amount):
        // Linear velocity first, then angular:
        this.center = this.center.plus(this.linear_velocity.times(time_amount));
        this.rotation.pre_multiply(Mat4.rotation(time_amount * this.angular_velocity, ...this.spin_axis));
    }

    // The following are our various functions for testing a single point,
    // p, against some analytically-known geometric volume formula

    blend_rotation(alpha) {
        // blend_rotation(): Just naively do a linear blend of the rotations, which looks
        // ok sometimes but otherwise produces shear matrices, a wrong result.

        // TODO:  Replace this function with proper quaternion blending, and perhaps
        // store this.rotation in quaternion form instead for compactness.
        return this.rotation.map((x, i) => vec4(...this.previous.rotation[i]).mix(x, alpha));
    }

    blend_state(alpha) {
        // blend_state(): Compute the final matrix we'll draw using the previous two physical
        // locations the object occupied.  We'll interpolate between these two states as
        // described at the end of the "Fix Your Timestep!" blog post.
        this.drawn_location = Mat4.translation(...this.previous.center.mix(this.center, alpha))
            .times(this.blend_rotation(alpha))
            .times(Mat4.scale(...this.size));
    }

    check_if_colliding(b, collider) {
        // check_if_colliding(): Collision detection function.
        // DISCLAIMER:  The collision method shown below is not used by anyone; it's just very quick
        // to code.  Making every collision body an ellipsoid is kind of a hack, and looping
        // through a list of discrete sphere points to see if the ellipsoids intersect is *really* a
        // hack (there are perfectly good analytic expressions that can test if two ellipsoids
        // intersect without discretizing them into points).
        if (this == b)
            return false;
        // Nothing collides with itself.
        // Convert sphere b to the frame where a is a unit sphere:
        const T = this.inverse.times(b.drawn_location, this.temp_matrix);

        const {intersect_test, points, leeway} = collider;
        // For each vertex in that b, shift to the coordinate frame of
        // a_inv*b.  Check if in that coordinate frame it penetrates
        // the unit sphere at the origin.  Leave some leeway.
        return points.arrays.position.some(p =>
            intersect_test(T.times(p.to4(1)).to3(), leeway));
    }
}


export class Simulation extends Scene {
    // **Simulation** manages the stepping of simulation time.  Subclass it when making
    // a Scene that is a physics demo.  This technique is careful to totally decouple
    // the simulation from the frame rate (see below).
    constructor() {
        super();
        Object.assign(this, {time_accumulator: 0, time_scale: 1, t: 0, dt: 1 / 20, bodies: [], steps_taken: 0});
    }

    simulate(frame_time) {
        // simulate(): Carefully advance time according to Glenn Fiedler's
        // "Fix Your Timestep" blog post.
        // This line gives ourselves a way to trick the simulator into thinking
        // that the display framerate is running fast or slow:
        frame_time = this.time_scale * frame_time;

        // Avoid the spiral of death; limit the amount of time we will spend
        // computing during this timestep if display lags:
        this.time_accumulator += Math.min(frame_time, 0.1);
        // Repeatedly step the simulation until we're caught up with this frame:
        while (Math.abs(this.time_accumulator) >= this.dt) {
            // Single step of the simulation for all bodies:
            this.update_state(this.dt);
            for (let b of this.bodies)
                b.advance(this.dt);
            // Following the advice of the article, de-couple
            // our simulation time from our frame rate:
            this.t += Math.sign(frame_time) * this.dt;
            this.time_accumulator -= Math.sign(frame_time) * this.dt;
            this.steps_taken++;
        }
        // Store an interpolation factor for how close our frame fell in between
        // the two latest simulation time steps, so we can correctly blend the
        // two latest states and display the result.
        let alpha = this.time_accumulator / this.dt;
        for (let b of this.bodies) b.blend_state(alpha);
    }

    make_control_panel() {
        // make_control_panel(): Create the buttons for interacting with simulation time.
        this.key_triggered_button("Speed up time", ["Shift", "T"], () => this.time_scale *= 5);
        this.key_triggered_button("Slow down time", ["t"], () => this.time_scale /= 5);
        this.new_line();
        this.live_string(box => {
            box.textContent = "Time scale: " + this.time_scale
        });
        this.new_line();
        this.live_string(box => {
            box.textContent = "Fixed simulation time step size: " + this.dt
        });
        this.new_line();
        this.live_string(box => {
            box.textContent = this.steps_taken + " timesteps were taken so far."
        });
    }

    display(context, program_state) {
        // display(): advance the time and state of our whole simulation.
        if (program_state.animate)
            this.simulate(program_state.animation_delta_time);
        // Draw each shape at its current location:
        for (let b of this.bodies)
            b.shape.draw(context, program_state, b.drawn_location, b.material);
    }

    update_state(dt)      // update_state(): Your subclass of Simulation has to override this abstract function.
    {
        throw "Override this"
    }
}


export class Test_Data {
    // **Test_Data** pre-loads some Shapes and Textures that other Scenes can borrow.
    constructor() {
        this.textures = {
            rgb: new Texture("assets/rgb.jpg"),
            earth: new Texture("assets/earth.gif"),
            // grid: new Texture("assets/grid.png"),
            stars: new Texture("assets/stars.png"),
            text: new Texture("assets/text.png"),
        }
        this.shapes = {
            donut: new defs.Torus(15, 15, [[0, 2], [0, 1]]),
            cone: new defs.Closed_Cone(4, 10, [[0, 2], [0, 1]]),
            capped: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
            ball: new defs.Subdivision_Sphere(3, [[0, 1], [0, 1]]),
            cube: new defs.Cube(),
            prism: new (defs.Capped_Cylinder.prototype.make_flat_shaded_version())(10, 10, [[0, 2], [0, 1]]),
            gem: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(2),
            donut2: new (defs.Torus.prototype.make_flat_shaded_version())(20, 20, [[0, 2], [0, 1]]),
            square: new defs.Square(),
            teapot: new Shape_From_File("assets/teapot.obj"),
            amogus: new Shape_From_File( "assets/amogus.obj"),
            igloo: new Shape_From_File('assets/igloo.obj'),
            skull: new Shape_From_File('assets/skull.obj')

        };
    }
}


export class Rage_Room extends Simulation {

    constructor() {
        super();
        this.data = new Test_Data();
        this.shapes = Object.assign({}, this.data.shapes);
        // Make simpler dummy shapes for representing all other shapes during collisions:
        this.colliders = [
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(1), leeway: .5},
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(2), leeway: .3},
            {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: .1}
        ];

        // Textures
        this.textures = {
            rgb: new Texture("assets/rgb.jpg"),
            earth: new Texture("assets/earth.gif"),
            stars: new Texture("assets/stars.png"),
            text: new Texture("assets/text.png"),
            wall: new Texture('assets/wall.jpg'),
            windowWall: new Texture("assets/window_wall2.jpg"),
            floor: new Texture("assets/floor.jpg"),
            ceiling: new Texture("assets/ceiling.jpg"),
            plainWall: new Texture('assets/plain_wall.jpg'),
            amogusSkin: new Texture('assets/amogusSkin.jpg')
        };

        // Materials
        this.materials = {
            plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
            wallpaper: new Material(new defs.Phong_Shader(),
                {ambient: 0.2, diffusivity: 1, color: hex_color("#c4aa7e")}),
            stars: new Material(new defs.Phong_Shader(), {
                ambient: .4, color: color(.4, .8, .4, 1),
                texture: this.textures.stars
            }),
            inactive_color: new Material(new defs.Fake_Bump_Map(1), {
                color: color(.5, .5, .5, 1), ambient: .2,
                texture: this.textures.rgb
            }),
            plainWall: new Material(new defs.Fake_Bump_Map(1), {
                color: color(0, 0, 0, 1), ambient: 1,
                texture: this.textures.plainWall
            }),
            brickWall: new Material(new defs.Fake_Bump_Map(1), {
                color: color(0, 0, 0, 1), ambient: 1,
                texture: this.textures.wall
            }),
            bright: new Material(new defs.Phong_Shader(), {
                color: color(0, 1, 0, .5), ambient: 1
            }),
            ceiling: new Material(new defs.Fake_Bump_Map(1), {
                color: color(0, 0, 0, 1), ambient: 1,
                texture: this.textures.ceiling
            }),
            floor: new Material(new defs.Fake_Bump_Map(1), {
                color: color(0, 0, 0, 1), ambient: 1,
                texture: this.textures.floor
            }),
            wall: new Material(new defs.Phong_Shader(1), {
                ambient: .4, color: color(.2,.2,.6,1),
            }),
            bumps: new Material(new defs.Fake_Bump_Map(1), {
            color: color(.5, .5, .5, 1),
                ambient: .3, diffusivity: .5, specularity: .5, texture: new Texture("assets/stars.png")
            }),
            amogusSkin: new Material(new defs.Fake_Bump_Map(1), {
            color: color(.5, .5, .5, 1),
            ambient: .8, diffusivity: .9, specularity: .8, texture: new Texture('assets/amogusSkin.jpg')}),
            skullSkin: new Material(new defs.Fake_Bump_Map(1), {
                color: color(.5, .5, .5, 1),
                ambient: .8, diffusivity: .9, specularity: .8, texture: new Texture('assets/skull_skin.jpg')})
        };

        this.collider_selection = 0;
        this.gravity = -9.8;
        this.room_size = 50;

        // Decides whether to drop an object or not
        this.drop = true;
        this.current_shape = this.shapes.teapot;
        this.current_material = this.materials.bumps;
        this.debris_shape = this.shapes.cube;
        this.secret = 0;

        this.shapes_list = ["teapot", "cube", "amogus", "igloo"];
        this.materials_list = ["bumps", "plastic", "amogus", "amogus"];
        this.shape_name = "Teapot";
    }

    random_shape(shape_list = this.shapes_list) {
        // random_shape():  Extract a random shape from this.shapes.
        return this.shapes[shape_list[~~(shape_list.length * Math.random())]]
    }

    random_texture(materials_list = this.materials_list) {
        // random_shape():  Extract a random shape from this.shapes.
        return this.materials[materials_list[~~(materials_list.length * Math.random())]]
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate additional moving bodies if there ever aren't enough:

        if (this.bodies.length === 0) {


            // floor
            let floor_transform = Mat4.rotation(Math.PI / 2, 1, 0, 0)
                .times(Mat4.scale(this.room_size, this.room_size, 1))
                .times(Mat4.translation(0, 0, -1));
            this.bodies.push(new Body(this.shapes.square, this.materials.floor, vec3(1, 1, 1), false, false, 0)
                .emplace(floor_transform, vec3(0, 0, 0), 0));

            // walls along the z-axis
            let wall_transform = Mat4.scale(this.room_size, this.room_size, 1)
                .times(Mat4.translation(0, 0, -1));

            // wall right behind
            this.bodies.push(new Body(this.shapes.square, this.materials.plainWall, vec3(1, 1, 1), S, false, 0)
                .emplace(Mat4.translation(0, this.room_size + 1, this.room_size + 1).times(wall_transform),
                    vec3(0, 0, 0), 0));
            // wall straight ahead
            this.bodies.push(new Body(this.shapes.square, this.materials.plainWall, vec3(1, 1, 1), N, false, 0)
                .emplace(Mat4.translation(0, this.room_size + 1, -this.room_size + 1).times(wall_transform),
                    vec3(0, 0, 0), 0));


            // walls along the x-axis
            wall_transform = Mat4.rotation(Math.PI / 2, 0, 1, 0)
                .times(wall_transform);

            // wall to the right
            this.bodies.push(new Body(this.shapes.square, this.materials.brickWall, vec3(1, 1, 1), E, false, 0)
                .emplace(Mat4.translation(this.room_size + 1, this.room_size + 1, 0).times(wall_transform),
                    vec3(0, 0, 0), 0));
            // wall to the left
            this.bodies.push(new Body(this.shapes.square, this.materials.plainWall, vec3(1, 1, 1), W, false, 0)
                .emplace(Mat4.translation(-this.room_size + 1, this.room_size + 1, 0).times(wall_transform),
                    vec3(0, 0, 0), 0));

            // ceiling
            let ceiling_transform = Mat4.rotation(Math.PI / 2, 1, 0, 0)
                .times(Mat4.scale(this.room_size, this.room_size, 1))
                .times(Mat4.translation(0, 0, -this.room_size));
            this.bodies.push(new Body(this.shapes.square, this.materials.ceiling, vec3(1, 1, 1), R, false, 0)
                .emplace(ceiling_transform, vec3(0, 0, 0), 0));
        }

        // Delete bodies that have lasted for too long;
        this.bodies = this.bodies.filter(b => (!b.debris && b.duration < 100) || (b.debris && b.duration < 8));

        // Delete bodies that have become too small;
        this.bodies = this.bodies.filter(b => b.size.dot(b.size) > 0.005);

        for (let a of this.bodies) {
            if (a.temporary !== U) {
                continue;
            }
            a.duration += dt;
            // Gravity on Earth, where 1 unit in world space = 1 meter:
            a.linear_velocity[1] += dt * this.gravity;
        }


        const collider = this.colliders[this.collider_selection];
        let walls = this.bodies.filter(b => b.temporary !== U);

        // Collider process
        for (let w of walls) {
            w.inverse = Mat4.inverse(w.drawn_location);
            for (let b of this.bodies) {

                // If this is a wall
                if (b.temporary !== U) {
                    continue;
                }

                let r = w.check_if_colliding(b, collider);
                if (r) {

                    // Collided with the wall (what kind of wall)
                    switch(w.temporary) {
                        // R for roof
                        case R: {
                            if (b.linear_velocity[1] > 0)
                                b.linear_velocity[1] *= -.8;
                            break;
                        }

                        // F for floor
                        case F: {
                            if (b.linear_velocity[1] < 0)
                                b.linear_velocity[1] *= -.8;
                            break;
                        }
                        // N for north
                        case N: {
                            if (b.linear_velocity[2] < 0)
                                b.linear_velocity[2] *= -.8;
                            break;
                        }
                        // S for south
                        case S: {
                            if (b.linear_velocity[2] > 0)
                                b.linear_velocity[2] *= -.8;
                            break;
                        }
                        // W for west
                        case W: {
                            if (b.linear_velocity[0] < 0)
                                b.linear_velocity[0] *= -.8;
                            break;
                        }
                        // E for east
                        case E: {
                            if (b.linear_velocity[0] > 0)
                                b.linear_velocity[0] *= -.8;
                            break;
                        }
                        default: {
                            if (b.linear_velocity[1] < 0)
                                b.linear_velocity[1] *= -.8;
                            break;
                        }
                    }

                    if (b.debris) {
                        continue;
                    }

                    let s = b.size;
                    b.size = s.times(1/1.05);

                    // Shattering process
                    let i = 0;
                    for (i = 0; i < 4; i++) {
                        this.bodies.push(new Body(this.debris_shape, this.materials.plastic, s.times(1/9), U, true, 0)
                            .emplace(b.drawn_location,
                                vec3(0, 1, 0).randomized(2).normalized().times(3), Math.random()));
                    }
                }
            }
        }
    }

    // when mouse is clicked, create an object in front of camera
    drop_object(e, pos, context, program_state) {
        let center_ndc_near = vec4(0.0, 0.0, 0.0, 1.0);
        let P = program_state.program_state.projection_transform;
        let W = program_state.program_state.camera_inverse;

        let a = Mat4.inverse(P.times(W));
        a[0] = vec4(1, 0, 0, a[0][3]);
        a[1] = vec4(0, 1, 0, a[1][3]);
        a[2] = vec4(0, 0, 1, a[2][3]);
        a[3] = vec4(0, 0, 0, a[3][3]);
        a[2][3] = a[2][3] - 5;      // create an object in front

        this.bodies.push(new Body(this.current_shape, this.current_material, vec3(2, 2, 2), U, false, 0)
                .emplace(a, vec3(0, -1, 0).randomized(2).normalized().times(3), Math.random()));
    }

    // when mouse is clicked, throw an object
    throw_object(e, pos, context, program_state) {
        let pos_ndc_far = vec4(pos[0], pos[1], 1.0, 1.0);
        let center_ndc_near = vec4(0.0, 0.0, 0.0, 1.0);

        let P = program_state.program_state.projection_transform;
        let W = program_state.program_state.camera_inverse;

        let pos_world_far = Mat4.inverse(P.times(W)).times(pos_ndc_far);
        let center_world_near = Mat4.inverse(P.times(W)).times(center_ndc_near);
        let camera_pos = Mat4.inverse(P.times(W)).times(center_ndc_near);
        let dir = W.times(pos_ndc_far).minus(W.times(center_ndc_near));

        pos_world_far.scale_by(1 / pos_world_far[3]);
        center_world_near.scale_by(1 / center_world_near[3]);
        camera_pos.scale_by(1 / camera_pos[3]);
        let direction_world = pos_world_far.minus(center_world_near);
        direction_world.scale_by(1/2);
        direction_world[1] = -direction_world[1];

        // convert to a translation matrix
        let a = Mat4.inverse(P.times(W));
        a[0] = vec4(1, 0, 0, a[0][3]);
        a[1] = vec4(0, 1, 0, a[1][3]);
        a[2] = vec4(0, 0, 1, a[2][3]);
        a[3] = vec4(0, 0, 0, a[3][3]);

        let b = new Body(this.current_shape, this.current_material, vec3(1, 1, 1), U, false, 0)
            .emplace(a, direction_world, 0);
        this.bodies.push(b);
    }

    make_control_panel() {
        // Switch to drop mode
        this.key_triggered_button("Drop", ["x"], () => {
            this.drop = true;
            this.reset_camera = true;
            this.camera = Mat4.translation(0, -10, -50)
                .times(Mat4.rotation(Math.PI / 5, 1, 0, 0));
        });

        // Switch to throw mode
        this.key_triggered_button("Throw", ["t"], () => {
            this.drop = false;
            this.reset_camera = true;
            this.camera = Mat4.translation(0, -20, -30);
        });

        // Switch throwing objects
        this.key_triggered_button("Teapot", ["Control", "1"], () => {
            this.shape_name = "Teapot";
            this.current_shape = this.shapes.teapot;
            this.current_material = this.materials.bumps;
        });
        this.key_triggered_button("Igloo", ["Control", "2"], () => {
            this.shape_name = "Igloo";
            this.current_shape = this.shapes.igloo;
            this.current_material = this.materials.amogusSkin;
        });
        this.key_triggered_button("Skull", ["Control", "3"], () => {
            this.shape_name = "Skull";
            this.current_shape = this.shapes.skull;
            this.current_material = this.materials.skullSkin;
        });

        this.new_line();
        this.live_string(box => {
            box.textContent = "Current Shape: " + this.shape_name;
        });
    }

    display(context, program_state) {
        // display(): Draw everything else in the scene besides the moving bodies.
        super.display(context, program_state);

        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            this.children.push(new defs.Program_State_Viewer());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(Mat4.translation(0, -10, -50)
                .times(Mat4.rotation(Math.PI / 5, 1, 0, 0)));

            // add event listeners
            let canvas = context.canvas;
            const mouse_position = (e, rect = canvas.getBoundingClientRect()) =>
                vec((e.clientX - (rect.left + rect.right) / 2) / ((rect.left + rect.right) / 2),
                    (e.clientY - (rect.bottom + rect.top) / 2) / ((rect.bottom + rect.top) / 2));
            canvas.addEventListener("mousedown", e => {
                e.preventDefault();
                if (this.drop) {
                    this.drop_object(e, mouse_position(e), program_state, context);
                }
                else {
                    this.throw_object(e, mouse_position(e), program_state, context);
                }
            });

            // secret!!
            document.addEventListener("keydown", e => {
                e.preventDefault();
                if (this.secret == 0 && e.code === "KeyT") {
                    this.secret = 1;
                }
                else if (this.secret == 1 && e.code === "KeyE") {
                    this.secret = 2;
                }
                else if (this.secret == 2 && e.code === "KeyA") {
                    this.secret = 3;
                }
                else if (this.secret == 3 && e.code === "KeyP") {
                    this.secret = 4;
                }
                else if (this.secret == 4 && e.code === "KeyO") {
                    this.secret = 5;
                }
                else if (this.secret == 5 && e.code === "KeyT") {
                    this.secret = 6;
                }
                else if (this.secret == 6 && e.code === "KeyS") {
                    console.log("teapots");
                    this.debris_shape = this.shapes.teapot;
                }
                else {
                    this.secret = 0;
                }
            });
        }



        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, 1, 100);

        // *** Lights: *** Values of vector or point lights.
        const light_position = vec4(0, 20, 8, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 100)];

        if (this.reset_camera) {
            program_state.set_camera(this.camera);
            this.reset_camera = false;
        }
    }

}
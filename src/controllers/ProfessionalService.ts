import {Request, Response} from "express";
import Controller from "./Controller";
import Service from "../services/ProfessionalService";
import {UserType} from "../types/constants";


export default class Package {

    private static service = new Service();

    public static async add(req: Request, res: Response) {
        const {id: userId} = res.locals.data;
        const payload = {
            ...req.body,
            userId,
            files: req.files ?? undefined,
        };

        const serviceResult = await Package.service.add(payload);

        Controller.response(res, serviceResult);
    }

    public static async package(req: Request, res: Response) {
        const {id, professionalId} = req.params;
        const {id: userId, userType} = res.locals.data;
        const includeProfile = userType != UserType.PROFESSIONAL;

        const serviceResult = await Package.service.service(professionalId!, id!, includeProfile);
        Controller.response(res, serviceResult);
    }

    public static async packages(req: Request, res: Response) {
        let {page, limit} = req.query;
        const {professionalId} = req.params;
        const {id: userId, userType} = res.locals.data;

        const parsedPage = parseInt(page as string) || 1;
        const parsedLimit = parseInt(limit as string) || 10;

        // If the logged in user is not the professional themselves, only show active services
        const onlyActive = !(userType === UserType.PROFESSIONAL && userId === professionalId);

        const serviceResult = await Package.service.professionalServices(professionalId!, parsedPage, parsedLimit, onlyActive);

        Controller.response(res, serviceResult);
    }

    public static async allServices(req: Request, res: Response) {
        let {page, limit} = req.query;

        const parsedPage = parseInt(page as string) || 1;
        const parsedLimit = parseInt(limit as string) || 10;

        const serviceResult = await Package.service.allServices(parsedPage, parsedLimit);

        Controller.response(res, serviceResult);
    }

    public static async nearByProfessionals(req: Request, res: Response) {
        let {page, limit, radius} = req.query;

        const parsedPage = parseInt(page as string) || 1;
        const parsedLimit = parseInt(limit as string) || 10;
        const parsedRadius = parseInt(radius as string) || 10;

        const lon = 3.3792;
        const lat = 6.5244;

        const serviceResult = await Package.service.nearByProfessionals(lon, lat, parsedRadius, parsedPage, parsedLimit);

        Controller.response(res, serviceResult);
    }

    public static async searchServices(req: Request, res: Response) {
        // Parse query parameters with defaults
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const name = req.query.name as string | undefined;
        const category = req.query.category as string | undefined;
        const description = req.query.description as string | undefined;

        const minPrice = req.query.minPrice !== undefined ? parseFloat(req.query.minPrice as string) : undefined;
        const maxPrice = req.query.maxPrice !== undefined ? parseFloat(req.query.maxPrice as string) : undefined;

        const remote = req.query.remote !== undefined ? req.query.remote === 'true' : undefined;
        const onsite = req.query.onsite !== undefined ? req.query.onsite === 'true' : undefined;
        const store = req.query.store !== undefined ? req.query.store === 'true' : undefined;

        const professionalId = req.query.professionalId as string | undefined;

        const serviceResult = await Package.service.searchServices({
            name,
            category,
            description,
            minPrice,
            maxPrice,
            remote,
            onsite,
            store,
            professionalId,
            page,
            limit
        });

        Controller.response(res, serviceResult);
    }

    public static async update(req: Request, res: Response) {
        const {id: professionalId} = res.locals.data;
        const {id} = req.params;

        const serviceResult = await Package.service.update({id, professionalId, ...req.body});

        Controller.response(res, serviceResult);
    }

    public static async updateServiceImages(req: Request, res: Response) {
        const {id: professionalId} = res.locals.data;
        const {id} = req.params;
        const {publicIds} = req.body;
        // const files = req.files as Express.Multer.File[];

        const serviceResult = await Package.service.updateServiceImages(professionalId, id!, req.files as Express.Multer.File[], publicIds ?? []);

        Controller.response(res, serviceResult);
    }


    public static async delete(req: Request, res: Response) {
        const {id: professionalId} = res.locals.data;
        const {id} = req.params;

        const serviceResult = await Package.service.delete(professionalId, id!);

        Controller.response(res, serviceResult);
    }
}
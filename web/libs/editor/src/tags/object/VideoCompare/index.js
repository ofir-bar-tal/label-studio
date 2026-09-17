import { inject, observer } from "mobx-react";
import Registry from "../../../core/Registry";

import { HtxVideoCompareView } from "./HtxVideoCompare";
import { VideoCompareModel } from "./VideoCompare";

const HtxVideoCompare = inject("store")(observer(HtxVideoCompareView));

Registry.addTag("videocompare", VideoCompareModel, HtxVideoCompare);
Registry.addObjectType(VideoCompareModel);

export { VideoCompareModel, HtxVideoCompare };
